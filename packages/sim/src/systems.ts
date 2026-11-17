import type { Ability, Definition, Modifier } from "data";
import { findPath } from "./nav.ts";
import {
  definitionOf,
  distance,
  drawIndex,
  findEntity,
  findPlayer,
  meetsRequirements,
  spawn,
  statOf,
  teamOf,
  TICK_SECONDS,
  toTicks,
  type Entity,
  type Order,
  type Owned,
  type PlayerState,
  type Point,
  type World,
} from "./world.ts";

/** What happened during one tick, for consumers to react to (S8). */
export type SimEvent =
  | { type: "died"; id: number; definitionId: string; playerId: string | null }
  | { type: "completed"; id: number }
  | { type: "produced"; id: number; buildingId: number }
  | { type: "researched"; playerId: string; upgradeId: string; level: number }
  | { type: "leveled"; id: number; level: number }
  | { type: "respawned"; id: number }
  /** `from` are the ids that became `id`. */
  | { type: "merged"; id: number; from: number[] }
  | { type: "defeated"; playerId: string }
  | { type: "ended"; winningTeam: string | null };

/** The least a weapon hit deals, however much armor the target has. */
const MIN_DAMAGE = 0.5;

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

/** Ends the order being carried out, so the next one starts. */
function finishOrder(entity: Entity): void {
  entity.orders.shift();
  clearPath(entity);
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
    finishOrder(entity);
    return;
  }
  if (entity.pathGoal === null) {
    entity.path = findPath(world, entity, order);
    entity.pathGoal = { x: order.x, y: order.y };
  }
  followPath(entity, speed);
  if (entity.path.length === 0) finishOrder(entity);
}

function runPatrol(world: World, entity: Entity, order: { points: Point[]; next: number }): void {
  const speed = statOf(world, entity, "speed");
  if (speed === undefined) {
    finishOrder(entity);
    return;
  }
  if (order.next < 0) {
    order.points.unshift({ x: entity.x, y: entity.y });
    order.next = 1;
  }
  const goal = order.points[order.next];
  if (entity.pathGoal === null) {
    entity.path = findPath(world, entity, goal);
    entity.pathGoal = { x: goal.x, y: goal.y };
  }
  followPath(entity, speed);
  if (entity.path.length === 0) {
    entity.pathGoal = null;
    order.next = (order.next + 1) % order.points.length;
  }
}

function runPath(world: World, entity: Entity, order: { pathId: string; next: number }): void {
  const speed = statOf(world, entity, "speed");
  const waypoints = world.paths[order.pathId];
  if (speed === undefined || waypoints === undefined || order.next >= waypoints.length) {
    finishOrder(entity);
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
    if (order.next >= waypoints.length) finishOrder(entity);
  }
}

function runAttack(world: World, entity: Entity, order: Extract<Order, { type: "attack" }>): void {
  const definition = definitionOf(world, entity);
  const { weapon } = definition;
  const target = findEntity(world, order.targetId);
  const beneath = entity.orders[1];
  const holding = beneath?.type === "hold";
  // A target the unit picked over another order is dropped once it leaves sight.
  const lost =
    target !== undefined &&
    order.acquired === true &&
    beneath !== undefined &&
    distance(entity, target) - definitionOf(world, target).radius > sightOf(world, entity, holding);
  if (weapon === undefined || target === undefined || target.health === null || lost) {
    finishOrder(entity);
    return;
  }
  const reach = (statOf(world, entity, "range") ?? 0) + definitionOf(world, target).radius;
  // Hits on one tick land together, so a target that died this tick still takes
  // a ready shot from a unit in reach, or one that gets there this tick.
  const dead = target.health <= 0;
  if (dead && entity.cooldown > 0) {
    finishOrder(entity);
    return;
  }
  // A unit holding its position fires only at what is already in reach.
  const inReach = holding
    ? distance(entity, target) <= reach
    : approach(world, entity, target, reach);
  if (!inReach) {
    if (dead || holding || definition.speed === undefined) finishOrder(entity);
    return;
  }
  if (entity.cooldown === 0) {
    const damage = statOf(world, entity, "damage") ?? 0;
    const armor = statOf(world, target, "armor") ?? 0;
    target.health -= damage > 0 ? Math.max(MIN_DAMAGE, damage - armor) : 0;
    recordHit(world, target, entity);
    entity.cooldown = toTicks(statOf(world, entity, "cooldown") ?? weapon.cooldown);
  }
}

/** Adds the dealer and its player to the target's hits for this tick, starting over on a new tick. */
function recordHit(world: World, target: Entity, dealer: Entity): void {
  const { lastHit } = target;
  if (lastHit === null || lastHit.tick !== world.tick) {
    target.lastHit = { tick: world.tick, playerIds: [dealer.playerId], entityIds: [dealer.id] };
    return;
  }
  if (!lastHit.playerIds.includes(dealer.playerId)) lastHit.playerIds.push(dealer.playerId);
  if (!lastHit.entityIds.includes(dealer.id)) lastHit.entityIds.push(dealer.id);
}

function applyEffects(
  world: World,
  ability: Ability,
  caster: Entity,
  target: Entity,
  events: SimEvent[],
): void {
  for (const effect of ability.effects) {
    switch (effect.type) {
      case "damage":
        if (target.health === null) continue;
        target.health -= effect.amount;
        recordHit(world, target, caster);
        break;
      case "modify":
        addModifier(target, effect);
        break;
      case "rollOffers":
        rollOffers(world, target);
        break;
      case "experience":
        gainExperience(world, target, effect.amount, events);
        break;
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
export function usableAbilities(world: World, entity: Entity, owned?: Owned): boolean[] {
  const nearby = new Map<string, boolean>();
  return definitionOf(world, entity).abilities.map((ability, index) => {
    if (!isReadyAndPaid(world, entity, index, owned)) return false;
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

function isReadyAndPaid(world: World, entity: Entity, index: number, owned?: Owned): boolean {
  const ability = definitionOf(world, entity).abilities[index];
  if (entity.buildRemaining > 0) return false;
  if (entity.abilityCooldowns[index] > 0 || entity.level < ability.level) return false;
  if (ability.cost === 0 && ability.requires.length === 0) return true;
  const owner = entity.playerId === null ? undefined : findPlayer(world, entity.playerId);
  if (owner === undefined || owner.resources < ability.cost) return false;
  return meetsRequirements(world, owner, ability.requires, owned);
}

/** Uses an ability `canUseAbility` allows, on the caster itself or on `target`, and pays for it. */
export function useAbility(
  world: World,
  entity: Entity,
  index: number,
  target: Entity,
  events: SimEvent[],
): void {
  const ability = definitionOf(world, entity).abilities[index];
  applyEffects(world, ability, entity, target, events);
  entity.abilityCooldowns[index] = toTicks(ability.cooldown);
  const owner = entity.playerId === null ? undefined : findPlayer(world, entity.playerId);
  if (owner !== undefined) owner.resources -= ability.cost;
}

function runCast(
  world: World,
  entity: Entity,
  order: Extract<Order, { type: "cast" }>,
  events: SimEvent[],
): void {
  const ability = definitionOf(world, entity).abilities[order.ability];
  const target = findEntity(world, order.targetId);
  if (
    target === undefined ||
    target.health === null ||
    entity.abilityCooldowns[order.ability] > 0
  ) {
    finishOrder(entity);
    return;
  }
  const reach = (ability.range ?? 0) + definitionOf(world, target).radius;
  const dead = target.health <= 0;
  if (!approach(world, entity, target, reach)) {
    if (dead || definitionOf(world, entity).speed === undefined) finishOrder(entity);
    return;
  }
  // The cost and `near` are checked where the effects land.
  if (!canUseAbility(world, entity, order.ability)) {
    finishOrder(entity);
    return;
  }
  useAbility(world, entity, order.ability, target, events);
  finishOrder(entity);
  // With nothing else to do, it keeps fighting what it cast at.
  if (entity.orders.length === 0 && definitionOf(world, entity).weapon !== undefined) {
    entity.orders.push({ type: "attack", targetId: target.id });
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
    finishOrder(entity);
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
      finishOrder(entity);
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
      if (entity.carrying > 0) {
        order.returning = true;
        clearPath(entity);
      } else {
        finishOrder(entity);
      }
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
    finishOrder(entity);
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
    finishOrder(entity);
  }
}

/**
 * How far an armed entity looks for a target: its acquire range, or its weapon
 * range when that is longer. One holding its position, or one that cannot
 * move, looks only as far as it shoots.
 */
function sightOf(world: World, entity: Entity, holding = false): number {
  const definition = definitionOf(world, entity);
  const { weapon } = definition;
  if (weapon === undefined) return 0;
  const range = statOf(world, entity, "range") ?? weapon.range;
  if (holding || definition.speed === undefined) return range;
  return Math.max(weapon.acquireRange ?? range, range);
}

/** Orders under which an armed entity picks its own targets. */
const ACQUIRING: ReadonlySet<Order["type"]> = new Set(["path", "attackMove", "patrol", "hold"]);

/**
 * Armed entities that are idle, walking, patrolling, or holding pick the
 * nearest enemy they can see, and go back to what they were doing afterward.
 */
function acquireTarget(world: World, entity: Entity, definition: Definition): void {
  if (definition.weapon === undefined || entity.buildRemaining > 0) return;
  const current = entity.orders[0];
  if (current !== undefined && !ACQUIRING.has(current.type)) return;
  const sight = sightOf(world, entity, current?.type === "hold");
  const target = nearest(
    world,
    entity,
    (other) =>
      isEnemy(world, entity, other) &&
      distance(entity, other) - definitionOf(world, other).radius <= sight,
  );
  if (target === undefined) return;
  entity.orders.unshift({ type: "attack", targetId: target.id, acquired: true });
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
    acquireTarget(world, entity, definitionOf(world, entity));
    const order = entity.orders[0];
    if (order === undefined) continue;
    switch (order.type) {
      case "move":
      case "attackMove":
        runMove(world, entity, order);
        break;
      case "patrol":
        runPatrol(world, entity, order);
        break;
      case "hold":
        clearPath(entity);
        break;
      case "attack":
        runAttack(world, entity, order);
        break;
      case "cast":
        runCast(world, entity, order, events);
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
    if ("upgradeId" in item) {
      const player = building.playerId === null ? undefined : findPlayer(world, building.playerId);
      if (player === undefined) continue;
      const level = (player.upgrades[item.upgradeId] ?? 0) + 1;
      player.upgrades[item.upgradeId] = level;
      events.push({ type: "researched", playerId: player.id, upgradeId: item.upgradeId, level });
      continue;
    }
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

/**
 * A death's experience goes in full to each living enemy with levels that
 * earns it: by being near enough, or, with killer credit, by dealing the last
 * damage. Only definitions with nearby credit need a look at every entity.
 */
function shareExperience(world: World, dead: Entity, experience: number, events: SimEvent[]): void {
  const earners: Entity[] = [];
  const killer = killerOf(world, dead);
  if (killer !== null) earners.push(killer);
  const nearbyCredit = Object.values(world.definitions).some(
    (definition) => definition.levels !== undefined && definition.levels.credit === "nearby",
  );
  if (nearbyCredit) {
    for (const entity of world.entities) {
      const { levels } = definitionOf(world, entity);
      if (levels?.credit !== "nearby" || !isEnemy(world, dead, entity)) continue;
      if (distance(entity, dead) <= (levels.range ?? 0)) earners.push(entity);
    }
  }
  earners.sort((a, b) => a.id - b.id);
  for (const entity of earners) gainExperience(world, entity, experience, events);
}

/** Adds experience to an entity with levels and applies the levels it reaches. */
export function gainExperience(
  world: World,
  entity: Entity,
  experience: number,
  events: SimEvent[],
): void {
  const { levels } = definitionOf(world, entity);
  if (levels === undefined) return;
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

/**
 * The living entity with killer credit that dealt the last damage, or null.
 * Hits on one tick land together, so a seeded draw picks among the living
 * entities that hit on the killing tick, one chance each, whether or not they
 * can earn. It draws only when one of them could, so scenarios without killer
 * credit draw as before.
 */
function killerOf(world: World, dead: Entity): Entity | null {
  const living = (dead.lastHit?.entityIds ?? []).flatMap((id) => findEntity(world, id) ?? []);
  const earns = (entity: Entity) =>
    definitionOf(world, entity).levels?.credit === "killer" && isEnemy(world, dead, entity);
  if (!living.some(earns)) return null;
  const drawn = living.length === 1 ? living[0] : living[drawIndex(world, living.length)];
  return earns(drawn) ? drawn : null;
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
  entity.orders = [];
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

export function endGame(world: World, winningTeam: string | null, events: SimEvent[]): void {
  if (world.outcome !== null) return;
  world.outcome = { winningTeam };
  events.push({ type: "ended", winningTeam });
}

/**
 * Triggers and concessions decide who is defeated. The game ends when one
 * team is left standing, which wins, or when nobody is.
 */
export function checkEnd(world: World, events: SimEvent[]): void {
  const { players } = world;
  // A team whose people and ai are all out is out, even with an unmanned base
  // left. A team of `none` seats alone, such as creeps, stays.
  for (const player of players) {
    if (player.controller !== "none" || player.defeated) continue;
    const seated = players.filter(
      (other) => other.team === player.team && other.controller !== "none",
    );
    if (seated.length > 0 && seated.every((other) => other.defeated)) {
      defeatPlayer(world, player.id, events);
    }
  }
  const standing = players.filter((player) => !player.defeated);
  const teams = (list: PlayerState[]) => new Set(list.map((player) => player.team)).size;
  if (standing.length === 0 ? players.length > 0 : teams(players) > 1 && teams(standing) === 1) {
    endGame(world, standing[0]?.team ?? null, events);
  }
}
