import { loadScenario } from "data";
import { expect, test } from "vite-plus/test";
import { createWorld, hashWorld, loadWorld, saveWorld, step, type Command } from "../src/index.ts";
import skirmish from "./fixtures/skirmish.json" with { type: "json" };

const TICKS = 600;

const script: Command[] = [
  { type: "move", playerId: "red", tick: 0, unitIds: [1], x: 50, y: 30 },
  { type: "move", playerId: "blue", tick: 15, unitIds: [2], x: 10.5, y: 7.25 },
  { type: "move", playerId: "red", tick: 120, unitIds: [1], x: 3, y: 40 },
  { type: "move", playerId: "blue", tick: 300, unitIds: [2], x: 33.3, y: 0.1 },
];

function run(seed: number, saveAt?: number): string {
  let world = createWorld(loadScenario(skirmish), seed);
  for (let tick = 0; tick < TICKS; tick++) {
    if (tick === saveAt) {
      world = loadWorld(saveWorld(world));
    }
    step(world, tick === 0 ? script : []);
  }
  return hashWorld(world);
}

test("the same scenario, seed, and commands produce the same hash", () => {
  expect(run(7)).toBe(run(7));
});

test("a save and load partway through does not change the hash", () => {
  expect(run(7, 60)).toBe(run(7));
  expect(run(7, 200)).toBe(run(7));
});

test("the hash depends on the seed and on the commands", () => {
  expect(run(8)).not.toBe(run(7));
  const world = createWorld(loadScenario(skirmish), 7);
  for (let tick = 0; tick < TICKS; tick++) step(world);
  expect(hashWorld(world)).not.toBe(run(7));
});

test("malformed commands are dropped and cannot make a save diverge", () => {
  const move: Omit<Command, "tick"> = { type: "move", playerId: "red", unitIds: [1], x: 20, y: 20 };
  const malformed: Command[] = [
    { ...move, tick: Number.NaN },
    { ...move, tick: Number.POSITIVE_INFINITY },
    { ...move, tick: 1.5 },
    { ...move, tick: 0, x: Number.NaN },
    { ...move, tick: 0, y: Number.NEGATIVE_INFINITY },
    { ...move, tick: 0, unitIds: [Number.NaN] },
  ];
  const world = createWorld(loadScenario(skirmish), 7);
  step(world, malformed);
  expect(world.pendingCommands).toEqual([]);
  expect(world.units[0]).toMatchObject({ x: 4, y: 4, target: null });
  expect(hashWorld(loadWorld(saveWorld(world)))).toBe(hashWorld(world));
});

test("negative zero never enters world state", () => {
  const world = createWorld(loadScenario(skirmish), 7);
  step(world, [{ type: "move", playerId: "red", tick: 0, unitIds: [1], x: -0, y: 4 }]);
  expect(Object.is(world.units[0].target?.x, 0)).toBe(true);
  step(world, [{ type: "move", playerId: "red", tick: 99, unitIds: [-0], x: -0, y: -0 }]);
  const queued = world.pendingCommands[0];
  expect([queued.x, queued.y, queued.unitIds[0]].every((value) => Object.is(value, 0))).toBe(true);
});
