import type { Ability, Definition, Modifier } from "data";
import { findPath } from "./nav.ts";
import {
  definitionOf,
  distance,
  drawIndex,
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
  /** `from` are the ids that became `id`. */
  | { type: "merged"; id: number; from: number[] }
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
  if (weapon === undefined || target === undefined || target.health === null || lost) {
    entity.order = resume;
    clearPath(entity);
    return;
  }
  const reach = weapon.range + definitionOf(world, target).radius;
  // Hits on one tick land together, so a target that died this tick still takes
  // a ready shot from a unit in reach, or one that gets there this tick.
  const dead = target.health <= 0;
  if (dead && entity.cooldown > 0) {
    entity.order = resume;
    clearPath(entity);
    return;
  }
  if (!approach(world, entity, target, reach)) {
    if (dead || definition.speed === undefined) entity.order = resume;
    if (dead) clearPath(entity);
    return;
  }
  if (entity.cooldown === 0) {
    target.health -= statOf(world, entity, "damage") ?? 0;
    recordHit(world, target, entity.playerId);
    entity.cooldown = toTicks(weapon.cooldown);
  }
}

/** Adds the dealing player to the target's hits for this tick, starting over on a new tick. */
function recordHit(world: World, target: Entity, playerId: string | null): void {
  const { lastHit } = target;
  if (lastHit === null || lastHit.tick !== world.tick) {
    target.lastHit = { tick: world.tick, playerIds: [playerId] };
  } else if (!lastHit.playerIds.includes(playerId)) {
    lastHit.playerIds.push(playerId);
  }
}

function applyEffects(world: World, ability: Ability, caster: Entity, target: Entity): void {
  for (const effect of ability.effects) {
    if (effect.type === "damage") {
      if (target.health === null) continue;
      target.health -= effect.amount;
      recordHit(world, target, caster.playerId);
    } else if (effect.type === "modify") {
      addModifier(target, effect);
    } else {
      rollOffers(world, target);
    }
  }
}

/** A modifier without `seconds` lasts for life and through respawn. */
export function addModifier(
  entity: Entity,
  modifier: { stat: Modifier["stat"]; add: number; seconds?: number },
): void {
  const { stat, add, seconds } = modifier;
  entity.modifiers.push({ stat, add, remaining: seconds === undefined ? null : toTicks(seconds) });
}

/** New offers drawn from the world's seeded generator. Nothing happens to one without offers. */
export function rollOffers(world: World, entity: Entity): void {
  const { offers } = definitionOf(world, entity);
  if (offers === undefined) return;
  const { definitionIds, count } = offers;
  entity.offers = [];
  for (let slot = 0; slot < count; slot++) {
    entity.offers.push(definitionIds[drawIndex(world, definitionIds.length)]);
  }
}

/** Whether one of `near`'s definitions on the entity's team is within its range, edge to edge. */
function isNear(world: World, entity: Entity, near: NonNullable<Ability["near"]>): boolean {
  const team = teamOf(world, entity.playerId);
  if (team === null) return false;
  const radius = definitionOf(world, entity).radius;
  return world.entities.some(
    (other) =>
      near.definitionIds.includes(other.definitionId) &&
      other.buildRemaining === 0 &&
      teamOf(world, other.playerId) === team &&
      distance(entity, other) - radius - definitionOf(world, other).radius <= near.range,
  );
}

/**
 * Whether the ability at `index` would take effect now, apart from its target:
 * ready, unlocked, paid for, and near what it needs. Commands, orders, the ai,
 * and the HUD all ask this, so they agree on every device.
 */
export function canUseAbility(world: World, entity: Entity, index: number): boolean {
  const ability = definitionOf(world, entity).abilities[index];
  if (ability === undefined || !isReadyAndPaid(world, entity, index)) return false;
  return ability.near === undefined || isNear(world, entity, ability.near);
}

/** `canUseAbility` for each of the entity's abilities, scanning once for each distinct `near`. */
export function usableAbilities(world: World, entity: Entity): boolean[] {
  const nearby = new Map<string, boolean>();
  return definitionOf(world, entity).abilities.map((ability, index) => {
    if (!isReadyAndPaid(world, entity, index)) return false;
    const { near } = ability;
    if (near === undefined) return true;
    const key = `${near.range} ${near.definitionIds.join(" ")}`;
    let found = nearby.get(key);
    if (found === undefined) {
      found = isNear(world, entity, near);
      nearby.set(key, found);
    }
    return found;
  });
}

function isReadyAndPaid(world: World, entity: Entity, index: number): boolean {
  const ability = definitionOf(world, entity).abilities[index];
  if (entity.buildRemaining > 0) return false;
  if (entity.abilityCooldowns[index] > 0 || entity.level < ability.level) return false;
  if (ability.cost === 0) return true;
  const owner = entity.playerId === null ? undefined : findPlayer(world, entity.playerId);
  return owner !== undefined && owner.resources >= ability.cost;
}

/** Uses an ability `canUseAbility` allows, on the caster itself or on `target`, and pays for it. */
export function useAbility(world: World, entity: Entity, index: number, target: Entity): void {
  const ability = definitionOf(world, entity).abilities[index];
  applyEffects(world, ability, entity, target);
  entity.abilityCooldowns[index] = toTicks(ability.cooldown);
  const owner = entity.playerId === null ? undefined : findPlayer(world, entity.playerId);
  if (owner !== undefined) owner.resources -= ability.cost;
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
    entity.abilityCooldowns[order.ability] > 0
  ) {
    entity.order = null;
    clearPath(entity);
    return;
  }
  const reach = (ability.range ?? 0) + definitionOf(world, target).radius;
  const dead = target.health <= 0;
  if (!approach(world, entity, target, reach)) {
    if (dead || definitionOf(world, entity).speed === undefined) entity.order = null;
    if (dead) clearPath(entity);
    return;
  }
  // The cost and `near` are checked where the effects land.
  if (!canUseAbility(world, entity, order.ability)) {
    entity.order = null;
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
  let expired = false;
  for (const modifier of entity.modifiers) {
    if (modifier.remaining === null) continue;
    modifier.remaining -= 1;
    if (modifier.remaining <= 0) expired = true;
  }
  if (!expired) return;
  entity.modifiers = entity.modifiers.filter(
    (modifier) => modifier.remaining === null || modifier.remaining > 0,
  );
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
    const { experience, bounty, respawn } = definitionOf(world, entity);
    if (experience > 0) shareExperience(world, entity, experience, events);
    if (bounty > 0) payBounty(world, entity, bounty);
    if (respawn !== undefined) {
      const remaining = respawn.seconds === undefined ? null : toTicks(respawn.seconds);
      world.respawns.push({ remaining, entity });
    }
  }
}

/**
 * The player who dealt the last damage gains the bounty, unless they are on the
 * dead entity's team. Hits on one tick land together, so a seeded draw picks
 * among their players rather than the order entities act in.
 */
function payBounty(world: World, dead: Entity, bounty: number): void {
  const { lastHit } = dead;
  if (lastHit === null) return;
  const { playerIds } = lastHit;
  const id = playerIds.length === 1 ? playerIds[0] : playerIds[drawIndex(world, playerIds.length)];
  const player = id === null ? undefined : findPlayer(world, id);
  if (player === undefined || player.team === teamOf(world, dead.playerId)) return;
  player.resources += bounty;
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
  for (const waiting of world.respawns) {
    if (waiting.remaining !== null) waiting.remaining -= 1;
  }
  bringBack(world, (waiting) => waiting.remaining !== null && waiting.remaining <= 0, events);
}

/** Respawns the waiting entities `due` accepts now, whatever their wait. */
export function bringBack(
  world: World,
  due: (waiting: World["respawns"][number]) => boolean,
  events: SimEvent[],
): void {
  const back = world.respawns.filter(due);
  if (back.length === 0) return;
  world.respawns = world.respawns.filter((waiting) => !due(waiting));
  for (const { entity } of back) {
    sendHome(world, entity);
    entity.buildRemaining = 0;
    entity.queue = [];
    entity.carrying = 0;
    world.entities.push(entity);
    events.push({ type: "respawned", id: entity.id });
  }
  world.entities.sort((a, b) => a.id - b.id);
}

/** Puts an entity back home at full health, with its orders, cooldowns, and timed modifiers cleared. */
export function sendHome(world: World, entity: Entity): void {
  entity.x = entity.home.x;
  entity.y = entity.home.y;
  entity.order = null;
  clearPath(entity);
  entity.cooldown = 0;
  entity.abilityCooldowns = entity.abilityCooldowns.map(() => 0);
  entity.modifiers = entity.modifiers.filter((modifier) => modifier.remaining === null);
  entity.lastHit = null;
  entity.health = statOf(world, entity, "maxHealth") ?? null;
}

/**
 * A player who owns `merge.count` finished entities of a definition loses the
 * lowest-id ones and gains one `merge.into` where the first stood. Repeats
 * until none applies, so merged units can merge again. Not a death.
 */
export function runMerges(world: World, events: SimEvent[]): void {
  const merging = Object.keys(world.definitions).filter(
    (id) => world.definitions[id].merge !== undefined,
  );
  if (merging.length === 0) return;
  // One pass groups the finished entities each player owns by definition, in id order.
  const groups = new Map<string, Entity[]>();
  const group = (playerId: string, definitionId: string) => {
    const at = `${playerId} ${definitionId}`;
    let found = groups.get(at);
    if (found === undefined) {
      found = [];
      groups.set(at, found);
    }
    return found;
  };
  for (const entity of world.entities) {
    if (entity.playerId === null || entity.buildRemaining > 0) continue;
    if (world.definitions[entity.definitionId].merge === undefined) continue;
    group(entity.playerId, entity.definitionId).push(entity);
  }
  const used = new Set<Entity>();
  for (const player of world.players) {
    let merged = true;
    while (merged) {
      merged = false;
      for (const id of merging) {
        const { count, into } = world.definitions[id].merge!;
        const same = group(player.id, id);
        while (same.length >= count) {
          const parts = same.splice(0, count);
          for (const part of parts) used.add(part);
          const result = spawn(world, into, player.id, parts[0].x, parts[0].y);
          group(player.id, into).push(result);
          events.push({ type: "merged", id: result.id, from: parts.map((part) => part.id) });
          merged = true;
        }
      }
    }
  }
  if (used.size > 0) world.entities = world.entities.filter((entity) => !used.has(entity));
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
