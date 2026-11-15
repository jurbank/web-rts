import type { Scenario, UnitDefinition } from "data";
import { hashState } from "./hash.ts";
import { seedRandom } from "./rng.ts";

export const TICK_RATE = 30;

export const TICK_SECONDS = 1 / TICK_RATE;

export interface Point {
  x: number;
  y: number;
}

export interface Unit extends Point {
  id: number;
  definitionId: string;
  playerId: string;
  target: Point | null;
}

export interface MoveCommand extends Point {
  type: "move";
  playerId: string;
  /** The tick the command takes effect. A tick already past means now. */
  tick: number;
  unitIds: number[];
}

export type Command = MoveCommand;

/** Plain data. Survives JSON without loss (S7). */
export interface World {
  tick: number;
  rngState: number;
  map: { width: number; height: number };
  unitDefinitions: Record<string, UnitDefinition>;
  /** In id order. */
  units: Unit[];
  /** In tick order, then arrival order. */
  pendingCommands: Command[];
}

export function createWorld(scenario: Scenario, seed: number): World {
  const unitDefinitions: Record<string, UnitDefinition> = {};
  for (const definition of scenario.unitDefinitions) {
    unitDefinitions[definition.id] = { ...definition };
  }
  return {
    tick: 0,
    rngState: seedRandom(seed),
    map: { ...scenario.map },
    unitDefinitions,
    units: scenario.placements.map((placement, index) => ({
      id: index + 1,
      definitionId: placement.definitionId,
      playerId: placement.playerId,
      x: placement.x + 0,
      y: placement.y + 0,
      target: null,
    })),
    pendingCommands: [],
  };
}

/** Advances the world one tick. The only place world state changes (S1). */
export function step(world: World, commands: readonly Command[] = []): void {
  for (const command of commands) {
    if (isValid(command)) enqueue(world.pendingCommands, command);
  }
  while (world.pendingCommands.length > 0 && world.pendingCommands[0].tick <= world.tick) {
    applyCommand(world, world.pendingCommands.shift()!);
  }
  moveUnits(world);
  world.tick += 1;
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

/** Non-finite numbers do not survive JSON, so they never enter world state (S7). */
function isValid(command: Command): boolean {
  return (
    Number.isInteger(command.tick) &&
    Number.isFinite(command.x) &&
    Number.isFinite(command.y) &&
    command.unitIds.every(Number.isInteger)
  );
}

function enqueue(queue: Command[], command: Command): void {
  let index = queue.length;
  while (index > 0 && queue[index - 1].tick > command.tick) {
    index -= 1;
  }
  queue.splice(index, 0, { ...command, unitIds: [...command.unitIds] });
}

function applyCommand(world: World, command: Command): void {
  const target = {
    x: clamp(command.x, 0, world.map.width),
    y: clamp(command.y, 0, world.map.height),
  };
  for (const unit of world.units) {
    if (unit.playerId === command.playerId && command.unitIds.includes(unit.id)) {
      unit.target = { ...target };
    }
  }
}

function moveUnits(world: World): void {
  for (const unit of world.units) {
    if (unit.target === null) continue;
    const dx = unit.target.x - unit.x;
    const dy = unit.target.y - unit.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const reach = world.unitDefinitions[unit.definitionId].speed * TICK_SECONDS;
    if (distance <= reach) {
      unit.x = unit.target.x;
      unit.y = unit.target.y;
      unit.target = null;
    } else {
      unit.x += (dx / distance) * reach;
      unit.y += (dy / distance) * reach;
    }
  }
}

/** Adding zero turns -0 into 0, which JSON would otherwise do on save. */
function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value + 0;
}
