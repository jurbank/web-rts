import type { Ability, Definition } from "data";
import { findPath } from "./nav.ts";
import {
  definitionOf,
  distance,
  findEntity,
  findPlayer,
  spawn,
  statOf,
  teamOf,
  TICK_SECONDS,
  toTicks,
  type Entity,
  type PlayerState,
  type Point,
  type World,
} from "./world.ts";

/** What happened during one tick, for consumers to react to (S8). */
export type SimEvent =
  | { type: "died"; id: number; definitionId: string; playerId: string | null }
  | { type: "completed"; id: number }
  | { type: "produced"; id: number; buildingId: number }
  | { type: "leveled"; id: number; level: number }
  | { type: "respawned"; id: number }
  | { type: "defeated"; playerId: string }
  | { type: "ended"; winnerId: string | null };

/** How close a unit must get to something it works on, beyond the two footprints. */
const WORK_MARGIN = 1.5;

/** Whether `other` is something `entity` fights: owned, damageable, and on another team. */
export function isEnemy(world: World, entity: Entity, other: Entity): boolean {
  return (
    other.playerId !== null &&
    other.playerId !== entity.playerId &&
    other.health !== null &&
    teamOf(world, other.playerId) !== teamOf(world, entity.playerId)
  );
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
  const speed = statOf(world, entity, "speed");
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
  const speed = statOf(world, entity, "speed");
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
  const speed = statOf(world, entity, "speed");
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

function runAttack(
  world: World,
  entity: Entity,
  order: Extract<Entity["order"], { type: "attack" }>,
): void {
  const definition = definitionOf(world, entity);
  const { weapon } = definition;
  const target = findEntity(world, order.targetId);
  const resume: Entity["order"] =
    order.resume === undefined ? null : { type: "path", ...order.resume };
  // A unit pulled off its path gives up on a target that gets out of sight.
  const lost =
    target !== undefined &&
    order.resume !== undefined &&
    distance(entity, target) - definitionOf(world, target).radius > sightOf(definition);
  if (
    weapon === undefined ||
    target === undefined ||
    target.health === null ||
    target.health <= 0 ||
    lost
  ) {
    entity.order = resume;
    clearPath(entity);
    return;
  }
  const reach = weapon.range + definitionOf(world, target).radius;
  if (!approach(world, entity, target, reach)) {
    if (definition.speed === undefined) entity.order = resume;
    return;
  }
  if (entity.cooldown === 0) {
    target.health -= statOf(world, entity, "damage") ?? 0;
    entity.cooldown = toTicks(weapon.cooldown);
  }
}

function applyEffects(world: World, ability: Ability, target: Entity): void {
  for (const effect of ability.effects) {
    if (effect.type === "damage") {
      if (target.health !== null) target.health -= effect.amount;
    } else {
      const { stat, add, seconds } = effect;
      target.modifiers.push({ stat, add, remaining: toTicks(seconds) });
    }
  }
}

/** Uses an ability whose cooldown has run out, on the caster itself or on `target`. */
export function useAbility(world: World, entity: Entity, index: number, target: Entity): void {
  const ability = definitionOf(world, entity).abilities[index];
  applyEffects(world, ability, target);
  entity.abilityCooldowns[index] = toTicks(ability.cooldown);
}

function runCast(
  world: World,
  entity: Entity,
  order: Extract<Entity["order"], { type: "cast" }>,
): void {
  const ability = definitionOf(world, entity).abilities[order.ability];
  const target = findEntity(world, order.targetId);
  if (
    target === undefined ||
    target.health === null ||
    target.health <= 0 ||
    entity.abilityCooldowns[order.ability] > 0
  ) {
    entity.order = null;
    clearPath(entity);
    return;
  }
  const reach = (ability.range ?? 0) + definitionOf(world, target).radius;
  if (!approach(world, entity, target, reach)) {
    if (definitionOf(world, entity).speed === undefined) entity.order = null;
    return;
  }
  useAbility(world, entity, order.ability, target);
  entity.order =
    definitionOf(world, entity).weapon === undefined
      ? null
      : { type: "attack", targetId: target.id };
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

/** How far an armed entity looks for a target. */
function sightOf(definition: Definition): number {
  const { weapon } = definition;
  if (weapon === undefined) return 0;
  return definition.speed === undefined ? weapon.range : (weapon.acquireRange ?? weapon.range);
}

/**
 * Armed entities that are idle or walking a path pick the nearest enemy they
 * can see. One on a path goes back to it afterward.
 */
function acquireTarget(world: World, entity: Entity, definition: Definition): void {
  if (definition.weapon === undefined || entity.buildRemaining > 0) return;
  const sight = sightOf(definition);
  const target = nearest(
    world,
    entity,
    (other) =>
      isEnemy(world, entity, other) &&
      distance(entity, other) - definitionOf(world, other).radius <= sight,
  );
  if (target === undefined) return;
  const { order } = entity;
  entity.order =
    order?.type === "path"
      ? { type: "attack", targetId: target.id, resume: { pathId: order.pathId, next: order.next } }
      : { type: "attack", targetId: target.id };
  clearPath(entity);
}

/** Wears modifiers and ability cooldowns down by one tick. */
function runTimers(world: World, entity: Entity): void {
  if (entity.cooldown > 0) entity.cooldown -= 1;
  for (let index = 0; index < entity.abilityCooldowns.length; index++) {
    if (entity.abilityCooldowns[index] > 0) entity.abilityCooldowns[index] -= 1;
  }
  if (entity.modifiers.length === 0) return;
  for (const modifier of entity.modifiers) modifier.remaining -= 1;
  entity.modifiers = entity.modifiers.filter((modifier) => modifier.remaining > 0);
  const maxHealth = statOf(world, entity, "maxHealth");
  if (entity.health !== null && maxHealth !== undefined && entity.health > maxHealth) {
    entity.health = maxHealth;
  }
}

export function runOrders(world: World, events: SimEvent[]): void {
  const count = world.entities.length;
  for (let index = 0; index < count; index++) {
    const entity = world.entities[index];
    runTimers(world, entity);
    if (entity.order === null || entity.order.type === "path") {
      acquireTarget(world, entity, definitionOf(world, entity));
    }
    const { order } = entity;
    if (order === null) continue;
    switch (order.type) {
      case "move":
        runMove(world, entity, order);
        break;
      case "attack":
        runAttack(world, entity, order);
        break;
      case "cast":
        runCast(world, entity, order);
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
  const dead = world.entities.filter(gone);
  world.entities = world.entities.filter((entity) => !gone(entity));
  for (const entity of dead) {
    events.push({
      type: "died",
      id: entity.id,
      definitionId: entity.definitionId,
      playerId: entity.playerId,
    });
    const { experience, respawn } = definitionOf(world, entity);
    if (experience > 0) shareExperience(world, entity, experience, events);
    if (respawn !== undefined) {
      world.respawns.push({ remaining: toTicks(respawn.seconds), entity });
    }
  }
}

/** Every living enemy with levels that is near enough to a death gains its full experience. */
function shareExperience(world: World, dead: Entity, experience: number, events: SimEvent[]): void {
  for (const entity of world.entities) {
    const { levels } = definitionOf(world, entity);
    if (levels === undefined || !isEnemy(world, dead, entity)) continue;
    if (distance(entity, dead) > levels.range) continue;
    entity.experience += experience;
    while (
      entity.level <= levels.thresholds.length &&
      entity.experience >= levels.thresholds[entity.level - 1]
    ) {
      const before = statOf(world, entity, "maxHealth") ?? 0;
      entity.experience -= levels.thresholds[entity.level - 1];
      entity.level += 1;
      if (entity.health !== null) {
        entity.health += (statOf(world, entity, "maxHealth") ?? 0) - before;
      }
      events.push({ type: "leveled", id: entity.id, level: entity.level });
    }
  }
}

/** Brings back the dead whose wait is over, at home and at full health, with their level. */
export function runRespawns(world: World, events: SimEvent[]): void {
  if (world.respawns.length === 0) return;
  for (const waiting of world.respawns) waiting.remaining -= 1;
  const due = world.respawns.filter((waiting) => waiting.remaining <= 0);
  if (due.length === 0) return;
  world.respawns = world.respawns.filter((waiting) => waiting.remaining > 0);
  for (const { entity } of due) {
    entity.x = entity.home.x;
    entity.y = entity.home.y;
    entity.order = null;
    clearPath(entity);
    entity.cooldown = 0;
    entity.abilityCooldowns = entity.abilityCooldowns.map(() => 0);
    entity.buildRemaining = 0;
    entity.queue = [];
    entity.carrying = 0;
    entity.modifiers = [];
    entity.health = statOf(world, entity, "maxHealth") ?? null;
    world.entities.push(entity);
    events.push({ type: "respawned", id: entity.id });
  }
  world.entities.sort((a, b) => a.id - b.id);
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
 * Triggers decide who is defeated. The game ends when one team is left
 * standing, or when nobody is. The winner is the first player standing.
 */
export function checkEnd(world: World, events: SimEvent[]): void {
  const { players } = world;
  const standing = players.filter((player) => !player.defeated);
  const teams = (list: PlayerState[]) => new Set(list.map((player) => player.team)).size;
  if (standing.length === 0 ? players.length > 0 : teams(players) > 1 && teams(standing) === 1) {
    endGame(world, standing[0]?.id ?? null, events);
  }
}
