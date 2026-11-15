import type { Point, World } from "./world.ts";

export interface UnitSnapshot {
  readonly id: number;
  readonly definitionId: string;
  readonly playerId: string;
  readonly x: number;
  readonly y: number;
  readonly target: Readonly<Point> | null;
}

export interface Snapshot {
  readonly tick: number;
  /** In id order. */
  readonly units: readonly UnitSnapshot[];
}

/** A copy, so it stays valid after later steps (S8). */
export function takeSnapshot(world: World): Snapshot {
  return {
    tick: world.tick,
    units: world.units.map((unit) => ({
      id: unit.id,
      definitionId: unit.definitionId,
      playerId: unit.playerId,
      x: unit.x,
      y: unit.y,
      target: unit.target === null ? null : { ...unit.target },
    })),
  };
}
