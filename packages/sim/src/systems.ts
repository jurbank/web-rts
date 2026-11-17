import type { Definition } from "data";
import { findPath } from "./nav.ts";
import {
  definitionOf,
  distance,
  findEntity,
  findPlayer,
  spawn,
  TICK_SECONDS,
  toTicks,
  type Entity,
  type Point,
  type World,
} from "./world.ts";

/** What happened during one tick, for consumers to react to (S8). */
export type SimEvent =
  | { type: "died"; id: number; definitionId: string; playerId: string | null }
  | { type: "completed"; id: number }
  | { type: "produced"; id: number; buildingId: number }
  | { type: "defeated"; playerId: string }
  | { type: "ended"; winnerId: string | null };

/** How close a unit must get to something it works on, beyond the two footprints. */
const WORK_MARGIN = 1.5;

export function isEnemy(entity: Entity, other: Entity): boolean {
  return other.playerId !== null && other.playerId !== entity.playerId && other.health !== null;
}

export function nearest(
  world: World,
  from: Point,
  accept: (entity: Entity) => boolean,
): Entity | undefined {
  let best: Entity | undefined;
  let bestDistance = Infinity;
  for (const entity of world.entities) {
    if (!accept(entity)) continue;
    const d = distance(from, entity);
    if (d < bestDistance) {
      best = entity;
      bestDistance = d;
    }
  }
  return best;
}

function clearPath(entity: Entity): void {
  entity.path = [];
  entity.pathGoal = null;
}

function followPath(entity: Entity, speed: number): void {
  let budget = speed * TICK_SECONDS;
  while (budget > 0 && entity.path.length > 0) {
    const next = entity.path[0];
    const d = distance(entity, next);
    if (d <= budget) {
      entity.x = next.x;
      entity.y = next.y;
      entity.path.shift();
      budget -= d;
    } else {
      entity.x += ((next.x - entity.x) / d) * budget;
      entity.y += ((next.y - entity.y) / d) * budget;
      budget = 0;
    }
  }
}

/** Moves toward `goal` and reports whether the entity is within `reach` of it. */
function approach(world: World, entity: Entity, goal: Point, reach: number): boolean {
  if (distance(entity, goal) <= reach) {
    clearPath(entity);
    return true;
  }
  const { speed } = definitionOf(world, entity);
  if (speed === undefined) return false;
  if (entity.pathGoal === null || distance(entity.pathGoal, goal) > 1) {
    entity.path = findPath(world, entity, goal);
    entity.pathGoal = { x: goal.x, y: goal.y };
  }
  followPath(entity, speed);
  return distance(entity, goal) <= reach;
}

function workReach(world: World, entity: Entity, target: Entity): number {
  return definitionOf(world, entity).radius + definitionOf(world, target).radius + WORK_MARGIN;
}

function runMove(world: World, entity: Entity, order: { x: number; y: number }): void {
  const { speed } = definitionOf(world, entity);
  if (speed === undefined) {
    entity.order = null;
    return;
  }
  if (entity.pathGoal === null) {
    entity.path = findPath(world, entity, order);
    entity.pathGoal = { x: order.x, y: order.y };
  }
  followPath(entity, speed);
  if (entity.path.length === 0) {
    entity.order = null;
    entity.pathGoal = null;
  }
}

function runPath(world: World, entity: Entity, order: { pathId: string; next: number }): void {
  const { speed } = definitionOf(world, entity);
  const waypoints = world.paths[order.pathId];
  if (speed === undefined || waypoints === undefined || order.next >= waypoints.length) {
    entity.order = null;
    clearPath(entity);
    return;
  }
  const goal = world.waypoints[waypoints[order.next]];
  if (entity.pathGoal === null) {
    entity.path = findPath(world, entity, goal);
    entity.pathGoal = { x: goal.x, y: goal.y };
  }
  followPath(entity, speed);
  if (entity.path.length === 0) {
    entity.pathGoal = null;
    order.next += 1;
    if (order.next >= waypoints.length) entity.order = null;
  }
}

function runAttack(world: World, entity: Entity, targetId: number): void {
  const { weapon, speed } = definitionOf(world, entity);
  const target = findEntity(world, targetId);
  if (
    weapon === undefined ||
    target === undefined ||
    target.health === null ||
    target.health <= 0
  ) {
    entity.order = null;
    clearPath(entity);
    return;
  }
  const reach = weapon.range + definitionOf(world, target).radius;
  if (!approach(world, entity, target, reach)) {
    if (speed === undefined) entity.order = null;
    return;
  }
  if (entity.cooldown === 0) {
    target.health -= weapon.damage;
    entity.cooldown = toTicks(weapon.cooldown);
  }
}

function runGather(
  world: World,
  entity: Entity,
  order: { nodeId: number; returning: boolean; progress: number },
): void {
  const { gatherer } = definitionOf(world, entity);
  const player = entity.playerId === null ? undefined : findPlayer(world, entity.playerId);
  if (gatherer === undefined || player === undefined) {
    entity.order = null;
    return;
  }

  if (order.returning) {
    const dropOff = nearest(
      world,
      entity,
      (other) =>
        other.playerId === entity.playerId &&
        other.buildRemaining === 0 &&
        definitionOf(world, other).dropOff,
    );
    if (dropOff === undefined) {
      entity.order = null;
      clearPath(entity);
    } else if (approach(world, entity, dropOff, workReach(world, entity, dropOff))) {
      player.resources += entity.carrying;
      entity.carrying = 0;
      order.returning = false;
    }
    return;
  }

  let node = findEntity(world, order.nodeId);
  if (node === undefined || node.amount <= 0) {
    node = nearest(world, entity, (other) => other.amount > 0);
    order.progress = 0;
    if (node === undefined) {
      if (entity.carrying > 0) order.returning = true;
      else entity.order = null;
      clearPath(entity);
      return;
    }
    order.nodeId = node.id;
    clearPath(entity);
  }
  if (!approach(world, entity, node, workReach(world, entity, node))) return;
  order.progress += 1;
  if (order.progress >= toTicks(gatherer.gatherTime)) {
    const taken = Math.min(gatherer.capacity - entity.carrying, node.amount);
    node.amount -= taken;
    entity.carrying += taken;
    order.progress = 0;
    order.returning = true;
  }
}

function runBuild(world: World, entity: Entity, buildingId: number, events: SimEvent[]): void {
  const building = findEntity(world, buildingId);
  if (building === undefined || building.buildRemaining === 0) {
    entity.order = null;
    clearPath(entity);
    return;
  }
  if (!approach(world, entity, building, workReach(world, entity, building))) return;
  const definition = definitionOf(world, building);
  building.buildRemaining -= 1;
  if (building.health !== null && definition.maxHealth !== undefined) {
    const gain = definition.maxHealth / toTicks(definition.buildTime);
    building.health = Math.min(definition.maxHealth, building.health + gain);
  }
  if (building.buildRemaining === 0) {
    events.push({ type: "completed", id: building.id });
    entity.order = null;
  }
}

/** Idle armed entities pick the nearest enemy they can see. */
function acquireTarget(world: World, entity: Entity, definition: Definition): void {
  const { weapon } = definition;
  if (weapon === undefined || entity.buildRemaining > 0) return;
  const sight =
    definition.speed === undefined ? weapon.range : (weapon.acquireRange ?? weapon.range);
  const target = nearest(
    world,
    entity,
    (other) =>
      isEnemy(entity, other) &&
      distance(entity, other) - definitionOf(world, other).radius <= sight,
  );
  if (target !== undefined) entity.order = { type: "attack", targetId: target.id };
}

export function runOrders(world: World, events: SimEvent[]): void {
  const count = world.entities.length;
  for (let index = 0; index < count; index++) {
    const entity = world.entities[index];
    if (entity.cooldown > 0) entity.cooldown -= 1;
    if (entity.order === null) acquireTarget(world, entity, definitionOf(world, entity));
    const { order } = entity;
    if (order === null) continue;
    switch (order.type) {
      case "move":
        runMove(world, entity, order);
        break;
      case "attack":
        runAttack(world, entity, order.targetId);
        break;
      case "gather":
        runGather(world, entity, order);
        break;
      case "build":
        runBuild(world, entity, order.buildingId, events);
        break;
      case "path":
        runPath(world, entity, order);
        break;
    }
  }
}

/** Where new units appear, tried in this order around the building. */
const EXITS: readonly Point[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 0.7071, y: 0.7071 },
  { x: -0.7071, y: 0.7071 },
  { x: 0.7071, y: -0.7071 },
  { x: -0.7071, y: -0.7071 },
];

function exitPoint(world: World, building: Entity, produced: Definition): Point {
  const gap = definitionOf(world, building).radius + produced.radius + 0.5;
  const options = EXITS.map((exit) => ({
    x: building.x + exit.x * gap,
    y: building.y + exit.y * gap,
  }));
  return (
    options.find(({ x, y }) => {
      if (x < 0 || y < 0 || x > world.map.width || y > world.map.height) return false;
      return world.entities.every((other) => {
        const definition = definitionOf(world, other);
        return (
          definition.speed !== undefined ||
          distance(other, { x, y }) >= definition.radius + produced.radius
        );
      });
    }) ?? options[0]
  );
}

export function runProduction(world: World, events: SimEvent[]): void {
  const count = world.entities.length;
  for (let index = 0; index < count; index++) {
    const building = world.entities[index];
    const item = building.queue[0];
    if (item === undefined || building.buildRemaining > 0) continue;
    item.remaining -= 1;
    if (item.remaining > 0) continue;
    building.queue.shift();
    const at = exitPoint(world, building, world.definitions[item.definitionId]);
    const unit = spawn(world, item.definitionId, building.playerId, at.x, at.y);
    events.push({ type: "produced", id: unit.id, buildingId: building.id });
  }
}

export function removeDead(world: World, events: SimEvent[]): void {
  const gone = (entity: Entity) =>
    (entity.health !== null && entity.health <= 0) ||
    (entity.amount <= 0 && definitionOf(world, entity).resource !== undefined);
  if (!world.entities.some(gone)) return;
  for (const entity of world.entities) {
    if (gone(entity)) {
      events.push({
        type: "died",
        id: entity.id,
        definitionId: entity.definitionId,
        playerId: entity.playerId,
      });
    }
  }
  world.entities = world.entities.filter((entity) => !gone(entity));
}

export function defeatPlayer(world: World, playerId: string, events: SimEvent[]): void {
  const player = findPlayer(world, playerId);
  if (player === undefined || player.defeated) return;
  player.defeated = true;
  events.push({ type: "defeated", playerId });
}

export function endGame(world: World, winnerId: string | null, events: SimEvent[]): void {
  if (world.outcome !== null) return;
  world.outcome = { winnerId };
  events.push({ type: "ended", winnerId });
}

/**
 * Triggers decide who is defeated. The game ends when one player is left
 * standing, or when nobody is.
 */
export function checkEnd(world: World, events: SimEvent[]): void {
  const { players } = world;
  const standing = players.filter((player) => !player.defeated);
  if (standing.length === 0 ? players.length > 0 : players.length > 1 && standing.length === 1) {
    endGame(world, standing[0]?.id ?? null, events);
  }
}
