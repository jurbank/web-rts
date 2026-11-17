import type { Definition, Modifier, Player, Region, Scenario, Trigger } from "data";
import type { Command } from "./commands.ts";
import { hashState } from "./hash.ts";
import { nextRandomState, randomUnit, seedRandom } from "./rng.ts";

export const TICK_RATE = 30;

export const TICK_SECONDS = 1 / TICK_RATE;

export interface Point {
  x: number;
  y: number;
}

export type Order =
  | { type: "move"; x: number; y: number }
  /** `resume` is the path order an enemy on the way interrupted. */
  | { type: "attack"; targetId: number; resume?: { pathId: string; next: number } }
  /** Walks into range of the target and uses the ability at this index in its definition. */
  | { type: "cast"; ability: number; targetId: number }
  | { type: "gather"; nodeId: number; returning: boolean; progress: number }
  | { type: "build"; buildingId: number }
  /** Walks a scenario path. `next` indexes the waypoint it is heading for. */
  | { type: "path"; pathId: string; next: number };

export interface QueueItem {
  definitionId: string;
  /** Ticks left. */
  remaining: number;
}

/** A modifier an ability left on an entity. */
export interface ActiveModifier extends Modifier {
  /** Ticks left, or null for one that lasts for life and through respawn. */
  remaining: number | null;
}

export interface Entity extends Point {
  id: number;
  definitionId: string;
  /** Null for neutral entities. */
  playerId: string | null;
  /** Null when it cannot be damaged. */
  health: number | null;
  order: Order | null;
  /** Waypoints still to visit. */
  path: Point[];
  /** Where `path` was computed to lead, or null when there is no path. */
  pathGoal: Point | null;
  /** Ticks until the weapon can fire. */
  cooldown: number;
  /** Resources a gatherer holds. */
  carrying: number;
  /** Resources left in a resource node. */
  amount: number;
  /** Ticks of construction left. Zero when complete. */
  buildRemaining: number;
  queue: QueueItem[];
  /** Where it first appeared, and where it respawns. */
  home: Point;
  /** Starts at 1. */
  level: number;
  /** Experience gained toward the next level. */
  experience: number;
  modifiers: ActiveModifier[];
  /** Ticks until each ability is ready, in the definition's ability order. */
  abilityCooldowns: number[];
  /** The players whose entities damaged it on the last tick anything did. Null for a neutral one. */
  lastHit: { tick: number; playerIds: (string | null)[] } | null;
}

export interface PlayerState {
  id: string;
  controller: Player["controller"];
  /** Players with the same team do not fight. */
  team: string;
  resources: number;
  defeated: boolean;
  ai: NonNullable<Player["ai"]> | null;
}

export interface TimerState {
  id: string;
  /** Ticks from start to firing. */
  period: number;
  repeat: boolean;
  /** Ticks left, or null when stopped. */
  remaining: number | null;
}

export interface RegionState extends Region {
  /** Ids of the entities inside at the end of the last tick, in id order. */
  inside: number[];
}

/** Plain data. Survives JSON without loss (S7). */
export interface World {
  tick: number;
  rngState: number;
  map: { width: number; height: number };
  definitions: Record<string, Definition>;
  players: PlayerState[];
  /** In id order. */
  entities: Entity[];
  nextEntityId: number;
  /** Dead entities waiting to come back, in the order they died. */
  respawns: { remaining: number; entity: Entity }[];
  /** In tick order, then player order, then the order each player sent them. */
  pendingCommands: Command[];
  /** Set once the game is decided. A null winner is a draw. */
  outcome: { winnerId: string | null } | null;
  variables: Record<string, number>;
  /** In scenario order, which is the order they fire in. */
  timers: TimerState[];
  /** In scenario order. */
  regions: RegionState[];
  waypoints: Record<string, Point>;
  /** Waypoint ids by path id. */
  paths: Record<string, string[]>;
  /** In scenario order, which is the order they run in. */
  triggers: Trigger[];
}

export function createWorld(scenario: Scenario, seed: number): World {
  const definitions: Record<string, Definition> = {};
  for (const definition of scenario.definitions) {
    definitions[definition.id] = copy(definition);
  }
  const world: World = {
    tick: 0,
    rngState: seedRandom(seed),
    map: { ...scenario.map },
    definitions,
    players: scenario.players.map((player) => ({
      id: player.id,
      controller: player.controller,
      team: player.team ?? player.id,
      resources: player.resources,
      defeated: false,
      ai: player.ai === undefined ? null : { ...player.ai },
    })),
    entities: [],
    nextEntityId: 1,
    respawns: [],
    pendingCommands: [],
    outcome: null,
    variables: {},
    timers: scenario.timers.map((timer) => ({
      id: timer.id,
      period: toTicks(timer.seconds),
      repeat: timer.repeat,
      remaining: null,
    })),
    regions: scenario.regions.map((region) => ({ ...region, inside: [] })),
    waypoints: {},
    paths: {},
    triggers: copy(scenario.triggers),
  };
  for (const variable of scenario.variables) world.variables[variable.id] = variable.value;
  for (const waypoint of scenario.waypoints) {
    world.waypoints[waypoint.id] = { x: waypoint.x, y: waypoint.y };
  }
  for (const path of scenario.paths) world.paths[path.id] = [...path.waypoints];
  for (const placement of scenario.placements) {
    spawn(world, placement.definitionId, placement.playerId, placement.x, placement.y);
  }
  // What starts inside a region never entered it.
  for (const region of world.regions) region.inside = entitiesInside(world, region);
  return world;
}

export function entitiesInside(world: World, region: Region): number[] {
  const ids: number[] = [];
  for (const entity of world.entities) {
    const inside =
      entity.x >= region.x &&
      entity.x <= region.x + region.width &&
      entity.y >= region.y &&
      entity.y <= region.y + region.height;
    if (inside) ids.push(entity.id);
  }
  return ids;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function spawn(
  world: World,
  definitionId: string,
  playerId: string | null,
  x: number,
  y: number,
): Entity {
  const definition = world.definitions[definitionId];
  const entity: Entity = {
    id: world.nextEntityId,
    definitionId,
    playerId,
    x: x + 0,
    y: y + 0,
    health: definition.maxHealth ?? null,
    order: null,
    path: [],
    pathGoal: null,
    cooldown: 0,
    carrying: 0,
    amount: definition.resource?.amount ?? 0,
    buildRemaining: 0,
    queue: [],
    home: { x: x + 0, y: y + 0 },
    level: 1,
    experience: 0,
    modifiers: [],
    abilityCooldowns: definition.abilities.map(() => 0),
    lastHit: null,
  };
  world.nextEntityId += 1;
  world.entities.push(entity);
  return entity;
}

/** Entities are in id order, so this is a binary search. */
export function findEntity(world: World, id: number): Entity | undefined {
  let low = 0;
  let high = world.entities.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const entity = world.entities[middle];
    if (entity.id === id) return entity;
    if (entity.id < id) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}

export function definitionOf(world: World, entity: Entity): Definition {
  return world.definitions[entity.definitionId];
}

/**
 * One of an entity's numbers after its levels and modifiers. Undefined when
 * its definition does not have that number at all.
 */
export function statOf(world: World, entity: Entity, stat: Modifier["stat"]): number | undefined {
  const definition = definitionOf(world, entity);
  const base = stat === "damage" ? definition.weapon?.damage : definition[stat];
  if (base === undefined) return undefined;
  let value = base;
  for (const modifier of definition.levels?.perLevel ?? []) {
    if (modifier.stat === stat) value += modifier.add * (entity.level - 1);
  }
  for (const modifier of entity.modifiers) {
    if (modifier.stat === stat) value += modifier.add;
  }
  // Health is divided by its maximum, so that never reaches zero.
  return Math.max(stat === "maxHealth" ? 1 : 0, value);
}

/** The team an owner is on. Neutral entities are on no team. */
export function teamOf(world: World, playerId: string | null): string | null {
  if (playerId === null) return null;
  return findPlayer(world, playerId)?.team ?? playerId;
}

export function findPlayer(world: World, id: string): PlayerState | undefined {
  return world.players.find((player) => player.id === id);
}

/** A whole number below `count` from the world's seeded generator. */
export function drawIndex(world: World, count: number): number {
  world.rngState = nextRandomState(world.rngState);
  return Math.floor(randomUnit(world.rngState) * count);
}

/** Converts a duration from scenario data to whole ticks (C7). */
export function toTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_RATE));
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Whether a footprint fits on the map clear of everything that does not move. */
export function canPlace(world: World, definition: Definition, x: number, y: number): boolean {
  const { radius } = definition;
  // Leave a corridor the widest unit can path through.
  let widest = 0;
  for (const id of Object.keys(world.definitions).sort()) {
    const other = world.definitions[id];
    if (other.speed !== undefined) widest = Math.max(widest, other.radius);
  }
  const gap = (widest + NAV_CLEARANCE) * 2;
  if (x < radius || y < radius || x > world.map.width - radius || y > world.map.height - radius) {
    return false;
  }
  for (const other of world.entities) {
    const otherDefinition = definitionOf(world, other);
    if (otherDefinition.speed !== undefined) continue;
    if (distance(other, { x, y }) < otherDefinition.radius + radius + gap) return false;
  }
  return true;
}

/** Extra room routes keep around obstacles, since they pass between cell centers. */
export const NAV_CLEARANCE = 0.5;

/** A definition by an id that came from outside, such as a command. */
export function findDefinition(world: World, id: string): Definition | undefined {
  return Object.hasOwn(world.definitions, id) ? world.definitions[id] : undefined;
}

export function hashWorld(world: World): string {
  return hashState(world);
}

export function saveWorld(world: World): string {
  return JSON.stringify(world);
}

export function loadWorld(saved: string): World {
  return JSON.parse(saved) as World;
}
