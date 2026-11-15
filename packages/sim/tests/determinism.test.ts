import { expect, test } from "vite-plus/test";
import { hashWorld, loadWorld, saveWorld, step, type Command } from "../src/index.ts";
import { entity, ids, skirmishWorld } from "./helpers.ts";

const TICKS = 4000;
const [worker, second, third] = ids.redWorkers;

/** A human player's game against the ai: gather, build, train, and send soldiers out. */
const script: Command[] = [
  { type: "gather", playerId: "red", tick: 0, unitIds: [second, third], nodeId: ids.redOre },
  {
    type: "build",
    playerId: "red",
    tick: 5,
    unitIds: [worker],
    definitionId: "barracks",
    x: 18,
    y: 24,
  },
  { type: "produce", playerId: "red", tick: 40, buildingId: ids.redHq, definitionId: "worker" },
  { type: "gather", playerId: "red", tick: 500, unitIds: [worker], nodeId: 6 },
  { type: "produce", playerId: "red", tick: 900, buildingId: ids.next, definitionId: "soldier" },
  { type: "produce", playerId: "red", tick: 1500, buildingId: ids.next, definitionId: "soldier" },
  {
    type: "move",
    playerId: "red",
    tick: 2500,
    unitIds: [20, 21, 22, 23, 24, 25, 26],
    x: 40.5,
    y: 7.25,
  },
  {
    type: "attack",
    playerId: "red",
    tick: 3200,
    unitIds: [20, 21, 22, 23, 24, 25, 26],
    targetId: ids.blueHq,
  },
];

function play(saveAt?: number): string {
  let world = skirmishWorld({ ai: true });
  for (let tick = 0; tick < TICKS; tick++) {
    if (tick === saveAt) {
      world = loadWorld(saveWorld(world));
    }
    step(world, tick === 0 ? script : []);
  }
  return hashWorld(world);
}

test("the same scenario, seed, and commands produce the same hash", () => {
  expect(play()).toBe(play());
});

test("a save and load partway through does not change the hash", () => {
  const expected = play();
  for (const saveAt of [3, 700, 2600, 3500]) {
    expect(play(saveAt)).toBe(expected);
  }
});

test("the hash depends on the commands", () => {
  const world = skirmishWorld({ ai: true });
  for (let tick = 0; tick < TICKS; tick++) step(world);
  expect(hashWorld(world)).not.toBe(play());
});

test("malformed commands are dropped and cannot make a save diverge", () => {
  const move = { type: "move", playerId: "red", unitIds: [worker], x: 20, y: 20 } as const;
  const malformed = [
    { ...move, tick: Number.NaN },
    { ...move, tick: Number.POSITIVE_INFINITY },
    { ...move, tick: 1.5 },
    { ...move, tick: 0, x: Number.NaN },
    { ...move, tick: 0, y: Number.NEGATIVE_INFINITY },
    { ...move, tick: 0, unitIds: [Number.NaN] },
    { ...move, tick: 0, type: "teleport" },
    { ...move, tick: 0, playerId: 7 },
    { type: "produce", playerId: "red", tick: 0, buildingId: "hq", definitionId: "worker" },
  ] as unknown as Command[];
  const world = skirmishWorld();
  step(world, malformed);
  expect(world.pendingCommands).toEqual([]);
  expect(entity(world, worker)).toMatchObject({ x: 12, y: 22, order: null });
  expect(hashWorld(loadWorld(saveWorld(world)))).toBe(hashWorld(world));
});

test("queued commands keep only known fields and never hold negative zero", () => {
  const world = skirmishWorld();
  const command = {
    type: "move",
    playerId: "red",
    tick: 99,
    unitIds: [-0],
    x: -0,
    y: -0,
    extra: () => 1,
  };
  step(world, [command as unknown as Command]);
  const queued = world.pendingCommands[0] as Extract<Command, { type: "move" }>;
  expect(Object.keys(queued).sort()).toEqual(["playerId", "tick", "type", "unitIds", "x", "y"]);
  expect([queued.x, queued.y, queued.unitIds[0]].every((value) => Object.is(value, 0))).toBe(true);
});
