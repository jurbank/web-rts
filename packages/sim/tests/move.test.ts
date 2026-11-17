import { expect, test } from "vite-plus/test";
import { createCommandQueue, step, takeSnapshot, TICK_RATE } from "../src/index.ts";
import { entity, ids, run, skirmishWorld } from "./helpers.ts";

const [worker, second, third] = ids.redWorkers;

test("a unit travels at its definition's speed and stops at its target", () => {
  const world = skirmishWorld();
  run(world, TICK_RATE, [
    { type: "move", playerId: "red", tick: 0, unitIds: [worker], x: 24, y: 6 },
  ]);
  const unit = entity(world, worker);
  expect(Math.hypot(unit.x - 12, unit.y - 22)).toBeCloseTo(4, 6);
  run(world, 5 * TICK_RATE);
  expect(unit).toMatchObject({ x: 24, y: 6, order: null, path: [] });
});

test("a queued command waits for its tick", () => {
  const world = skirmishWorld();
  const queue = createCommandQueue();
  queue.add({ type: "move", playerId: "red", tick: 10, unitIds: [worker], x: 24, y: 22 }, 0);
  for (let tick = 0; tick < 10; tick++) step(world, queue.take(world.tick));
  expect(entity(world, worker).x).toBe(12);
  step(world, queue.take(world.tick));
  expect(entity(world, worker).x).toBeGreaterThan(12);
});

test("a player cannot command another player's unit", () => {
  const world = skirmishWorld();
  run(world, 30, [
    { type: "move", playerId: "red", tick: 0, unitIds: ids.blueWorkers, x: 40, y: 40 },
  ]);
  expect(entity(world, ids.blueWorkers[0])).toMatchObject({ x: 52, y: 22, order: null });
});

test("a group spreads out around the target instead of stacking", () => {
  const world = skirmishWorld();
  run(world, 10 * TICK_RATE, [
    { type: "move", playerId: "red", tick: 0, unitIds: ids.redWorkers, x: 24, y: 8 },
  ]);
  const units = [worker, second, third].map((id) => entity(world, id));
  expect(units.every((unit) => unit.order === null)).toBe(true);
  for (const a of units) {
    for (const b of units) {
      if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(1);
    }
    expect(Math.hypot(a.x - 24, a.y - 8)).toBeLessThan(2);
  }
});

test("a target outside the map is clamped to its edge", () => {
  const world = skirmishWorld();
  run(world, 10 * TICK_RATE, [
    { type: "move", playerId: "red", tick: 0, unitIds: [worker], x: 12, y: -100 },
  ]);
  expect(entity(world, worker)).toMatchObject({ x: 12, y: 0, order: null });
});

test("a snapshot is unaffected by later steps", () => {
  const world = skirmishWorld();
  run(world, 1, [{ type: "move", playerId: "red", tick: 0, unitIds: [worker], x: 24, y: 22 }]);
  const snapshot = takeSnapshot(world);
  const copy = JSON.parse(JSON.stringify(snapshot));
  run(world, 30);
  expect(snapshot).toEqual(copy);
  expect(takeSnapshot(world).entities[1].x).toBeGreaterThan(snapshot.entities[1].x);
});
