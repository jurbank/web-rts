import { definitionOf, statOf, teamOf, type Entity, type Point, type World } from "./world.ts";

export interface RememberedBuilding extends Point {
  id: number;
  definitionId: string;
  playerId: string;
}

interface TeamMemory {
  explored: number[];
  buildings: RememberedBuilding[];
}

export interface FogState {
  columns: number;
  rows: number;
  teams: Record<string, TeamMemory>;
  /** A timed reveal refreshes the same team and region in place. */
  reveals: { team: string; region: string; remaining: number }[];
}

/** A bit per cell, row by row. Only exploration and sightings survive a save. */
export interface FogSnapshot {
  readonly columns: number;
  readonly rows: number;
  readonly explored: readonly number[];
  readonly visible: readonly number[];
  readonly buildings: readonly Readonly<RememberedBuilding>[];
}

// Current sight is derived at tick boundaries. Restores rebuild it before any simulation system runs.
const current = new WeakMap<World, Map<string, number[]>>();

export function createFog(world: World): FogState {
  // About one ground unit per cell on ordinary maps. Bound the cost on large user maps.
  const scale = Math.max(1, world.map.width / 128, world.map.height / 128);
  const columns = Math.ceil(world.map.width / scale);
  const rows = Math.ceil(world.map.height / scale);
  const words = Math.ceil((columns * rows) / 32);
  return {
    columns,
    rows,
    reveals: [],
    teams: Object.fromEntries(
      world.players.map(({ team }) => [
        team,
        { explored: Array<number>(words).fill(0), buildings: [] },
      ]),
    ),
  };
}

function cellAt(world: World, point: Point): number {
  const { columns, rows } = world.fog!;
  const x = Math.max(0, Math.min(columns - 1, Math.floor((point.x / world.map.width) * columns)));
  const y = Math.max(0, Math.min(rows - 1, Math.floor((point.y / world.map.height) * rows)));
  return y * columns + x;
}

function contains(bits: readonly number[], cell: number): boolean {
  return (bits[cell >>> 5] & (1 << (cell & 31))) !== 0;
}

function illuminate(bits: number[], cell: number): void {
  bits[cell >>> 5] |= 1 << (cell & 31);
}

function computeSight(world: World): Map<string, number[]> {
  const { columns, rows, teams } = world.fog!;
  const sight = new Map(
    Object.entries(teams).map(
      ([team, memory]) => [team, Array<number>(memory.explored.length).fill(0)] as const,
    ),
  );
  const width = world.map.width / columns;
  const height = world.map.height / rows;
  for (const entity of world.entities) {
    const team = teamOf(world, entity.playerId);
    if (team === null || entity.buildRemaining > 0) continue;
    const radius = statOf(world, entity, "sight") ?? 0;
    if (radius <= 0) continue;
    const bits = sight.get(team)!;
    illuminate(bits, cellAt(world, entity));
    const top = Math.max(0, Math.ceil((entity.y - radius) / height - 0.5));
    const bottom = Math.min(rows - 1, Math.floor((entity.y + radius) / height - 0.5));
    for (let row = top; row <= bottom; row++) {
      const dy = (row + 0.5) * height - entity.y;
      const span = Math.sqrt(Math.max(0, radius * radius - dy * dy));
      const left = Math.max(0, Math.ceil((entity.x - span) / width - 0.5));
      const right = Math.min(columns - 1, Math.floor((entity.x + span) / width - 0.5));
      for (let x = left; x <= right; x++) illuminate(bits, row * columns + x);
    }
  }
  for (const reveal of world.fog!.reveals) {
    const region = world.regions.find((each) => each.id === reveal.region)!;
    const bits = sight.get(reveal.team)!;
    const right = Math.min(columns, Math.ceil((region.x + region.width) / width));
    const bottom = Math.min(rows, Math.ceil((region.y + region.height) / height));
    for (let row = Math.floor(region.y / height); row < bottom; row++) {
      for (let x = Math.floor(region.x / width); x < right; x++)
        illuminate(bits, row * columns + x);
    }
  }
  current.set(world, sight);
  return sight;
}

export function restoreSight(world: World): void {
  if (world.fog) computeSight(world);
}

/** Trigger conditions see movement and previous actions in the same tick. */
export function invalidateSight(world: World): void {
  if (world.fog) current.delete(world);
}

export function advanceReveals(world: World): void {
  if (!world.fog) return;
  for (const reveal of world.fog.reveals) reveal.remaining -= 1;
  world.fog.reveals = world.fog.reveals.filter((each) => each.remaining > 0);
  invalidateSight(world);
}

export function revealRegion(world: World, team: string, region: string, ticks: number): void {
  if (!world.fog) return;
  const existing = world.fog.reveals.find((each) => each.team === team && each.region === region);
  if (existing) existing.remaining = Math.max(existing.remaining, ticks);
  else world.fog.reveals.push({ team, region, remaining: ticks });
}

function teamSight(world: World, team: string): number[] {
  return (current.get(world) ?? computeSight(world)).get(team) ?? [];
}

export function seesPoint(world: World, playerId: string | null, point: Point): boolean {
  if (!world.fog) return true;
  const team = teamOf(world, playerId);
  return team !== null && contains(teamSight(world, team), cellAt(world, point));
}

/** Every on-map cell where a blocker could prevent placement must be scouted. */
export function seesBuildSite(
  world: World,
  viewer: string,
  center: Point,
  clearance: number,
): boolean {
  if (!world.fog) return true;
  const { columns, rows } = world.fog;
  const bits = teamSight(world, teamOf(world, viewer)!);
  const width = world.map.width / columns;
  const height = world.map.height / rows;
  const left = Math.max(0, Math.floor((center.x - clearance) / width));
  const top = Math.max(0, Math.floor((center.y - clearance) / height));
  const right = Math.min(columns - 1, Math.floor((center.x + clearance) / width));
  const bottom = Math.min(rows - 1, Math.floor((center.y + clearance) / height));
  for (let row = top; row <= bottom; row++) {
    const dy = Math.max(row * height - center.y, center.y - (row + 1) * height, 0);
    for (let column = left; column <= right; column++) {
      if (contains(bits, row * columns + column)) continue;
      const dx = Math.max(column * width - center.x, center.x - (column + 1) * width, 0);
      if (dx * dx + dy * dy < clearance * clearance) return false;
    }
  }
  return true;
}

export function seesEntity(world: World, playerId: string | null, entity: Entity): boolean {
  return (
    !world.fog ||
    (playerId !== null && teamOf(world, playerId) === teamOf(world, entity.playerId)) ||
    seesPoint(world, playerId, entity)
  );
}

/** After all movement, deaths and trigger actions, record what each team can now observe. */
export function updateFog(world: World): void {
  if (!world.fog) return;
  for (const [team, bits] of computeSight(world)) {
    const memory = world.fog.teams[team];
    for (let i = 0; i < bits.length; i++) memory.explored[i] |= bits[i];
    // A scouted empty site corrects an old sighting. An unseen demolition does not.
    const hidden = memory.buildings.filter((each) => !contains(bits, cellAt(world, each)));
    for (const entity of world.entities) {
      if (
        entity.playerId === null ||
        teamOf(world, entity.playerId) === team ||
        definitionOf(world, entity).speed !== undefined ||
        !contains(bits, cellAt(world, entity))
      )
        continue;
      const { id, definitionId, playerId, x, y } = entity;
      hidden.push({ id, definitionId, playerId, x, y });
    }
    memory.buildings = hidden;
  }
}

export function fogSnapshot(world: World, team: string): FogSnapshot {
  const { columns, rows, teams } = world.fog!;
  const visible = teamSight(world, team);
  const memory = teams[team];
  return {
    columns,
    rows,
    visible: [...visible],
    explored: [...memory.explored],
    buildings: memory.buildings
      .filter((each) => !contains(visible, cellAt(world, each)))
      .map((each) => ({ ...each })),
  };
}

/** An attack-move destination chosen only from the team's scouting information. */
export function scoutingPoint(world: World, team: string, from: Point): Point | undefined {
  const fog = world.fog;
  if (!fog) return undefined;
  const { explored, buildings } = fog.teams[team];
  const target = buildings.find(
    (building) => world.definitions[building.definitionId].maxHealth !== undefined,
  );
  if (target) return { x: target.x, y: target.y };
  // Search across the map. Ties keep the first cell in row order.
  let farthest = -1;
  let goal: Point | undefined;
  for (let row = 0; row < fog.rows; row++) {
    for (let column = 0; column < fog.columns; column++) {
      if (contains(explored, row * fog.columns + column)) continue;
      const x = ((column + 0.5) * world.map.width) / fog.columns;
      const y = ((row + 0.5) * world.map.height) / fog.rows;
      const dx = x - from.x;
      const dy = y - from.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > farthest) {
        farthest = distanceSquared;
        goal = { x, y };
      }
    }
  }
  return goal;
}
