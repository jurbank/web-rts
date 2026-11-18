import type { Definition } from "data";
import {
  canPlace,
  createCommandQueue,
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
  /** Holds a command until its tick. Returns false when the queue refuses it. */
  submit(command: Command): boolean;
  /** Steps the world to catch up with real time. Returns how far into the next tick we are, in [0, 1). */
  advance(elapsedSeconds: number): number;
  /** Whether the sim would accept a building here right now. */
  canPlace(definition: Definition, x: number, y: number): boolean;
}

export function createGameLoop(world: World, viewer: string): GameLoop {
  let previous = takeSnapshot(world, viewer);
  let current = previous;
  let accumulator = 0;
  const queue = createCommandQueue();

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
      return queue.add(command, world.tick);
    },
    advance(elapsedSeconds) {
      accumulator += Math.min(elapsedSeconds, MAX_FRAME_SECONDS);
      while (accumulator >= TICK_SECONDS) {
        const events = step(world, queue.take(world.tick));
        previous = current;
        current = takeSnapshot(world, viewer, events);
        accumulator -= TICK_SECONDS;
      }
      return accumulator / TICK_SECONDS;
    },
    canPlace(definition, x, y) {
      return canPlace(world, definition, x, y, viewer);
    },
  };
}
