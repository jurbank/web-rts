import type { Definition } from "data";
import {
  canPlace,
  step,
  takeSnapshot,
  TICK_SECONDS,
  type Command,
  type Snapshot,
  type World,
} from "sim";

/** Longest stretch of real time one frame may simulate, so a stall cannot snowball. */
const MAX_FRAME_SECONDS = 0.25;

export interface GameLoop {
  readonly previous: Snapshot;
  readonly current: Snapshot;
  /** The tick the next submitted command will run on. */
  readonly tick: number;
  submit(command: Command): void;
  /** Steps the world to catch up with real time. Returns how far into the next tick we are, in [0, 1). */
  advance(elapsedSeconds: number): number;
  /** Whether the sim would accept a building here right now. */
  canPlace(definition: Definition, x: number, y: number): boolean;
}

export function createGameLoop(world: World): GameLoop {
  let previous = takeSnapshot(world);
  let current = previous;
  let accumulator = 0;
  let pending: Command[] = [];

  return {
    get previous() {
      return previous;
    },
    get current() {
      return current;
    },
    get tick() {
      return world.tick;
    },
    submit(command) {
      pending.push(command);
    },
    advance(elapsedSeconds) {
      accumulator += Math.min(elapsedSeconds, MAX_FRAME_SECONDS);
      while (accumulator >= TICK_SECONDS) {
        step(world, pending);
        pending = [];
        previous = current;
        current = takeSnapshot(world);
        accumulator -= TICK_SECONDS;
      }
      return accumulator / TICK_SECONDS;
    },
    canPlace(definition, x, y) {
      return canPlace(world, definition, x, y);
    },
  };
}
