import { loadScenario } from "data";
import { expect, test } from "vite-plus/test";
import { createWorld, step, takeSnapshot, TICK_RATE, type World } from "../src/index.ts";
import skirmish from "./fixtures/skirmish.json" with { type: "json" };

function world(): World {
  return createWorld(loadScenario(skirmish), 1);
}

function advance(target: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(target);
}

test("a unit travels to its target at its definition's speed and stops there", () => {
  const w = world();
  const scout = w.units[0];
  step(w, [{ type: "move", playerId: "red", tick: 0, unitIds: [scout.id], x: 34, y: 44 }]);
  advance(w, TICK_RATE - 1);
  expect(Math.hypot(scout.x - 4, scout.y - 4)).toBeCloseTo(6, 9);
  advance(w, 8 * TICK_RATE);
  expect(scout).toMatchObject({ x: 34, y: 44, target: null });
});

test("a command waits for its tick", () => {
  const w = world();
  step(w, [{ type: "move", playerId: "red", tick: 10, unitIds: [1], x: 20, y: 4 }]);
  advance(w, 9);
  expect(w.units[0].x).toBe(4);
  advance(w, 1);
  expect(w.units[0].x).toBeGreaterThan(4);
});

test("a player cannot move another player's unit", () => {
  const w = world();
  step(w, [{ type: "move", playerId: "red", tick: 0, unitIds: [2], x: 0, y: 0 }]);
  expect(w.units[1]).toMatchObject({ x: 60, y: 44, target: null });
});

test("a target outside the map is clamped to its edge", () => {
  const w = world();
  step(w, [{ type: "move", playerId: "red", tick: 0, unitIds: [1], x: -100, y: 4 }]);
  advance(w, 60);
  expect(w.units[0]).toMatchObject({ x: 0, y: 4, target: null });
});

test("a snapshot is unaffected by later steps", () => {
  const w = world();
  step(w, [{ type: "move", playerId: "red", tick: 0, unitIds: [1], x: 20, y: 4 }]);
  const snapshot = takeSnapshot(w);
  const copy = structuredCopy(snapshot);
  advance(w, 30);
  expect(snapshot).toEqual(copy);
  expect(takeSnapshot(w).units[0].x).toBeGreaterThan(snapshot.units[0].x);
});

function structuredCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
