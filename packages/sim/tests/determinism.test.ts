import { expect, test } from "vite-plus/test";
import {
  COMMAND_HORIZON,
  createCommandQueue,
  hashWorld,
  loadWorld,
  MAX_UNIT_IDS,
  saveWorld,
  step,
  type Command,
} from "../src/index.ts";
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
    step(
      world,
      script.filter((command) => command.tick === tick),
    );
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
  expect(entity(world, worker)).toMatchObject({ x: 12, y: 22, order: null });
  expect(hashWorld(loadWorld(saveWorld(world)))).toBe(hashWorld(world));
});

test("queued commands keep only known fields, unique ids, and never negative zero", () => {
  const queue = createCommandQueue();
  const command = {
    type: "move",
    playerId: "red",
    tick: 9,
    unitIds: [-0, 4, 4],
    x: -0,
    y: -0,
    extra: () => 1,
  };
  expect(queue.add(command as unknown as Command, 0)).toBe(true);
  const [queued] = queue.take(9) as Extract<Command, { type: "move" }>[];
  expect(Object.keys(queued).sort()).toEqual(["playerId", "tick", "type", "unitIds", "x", "y"]);
  expect(queued.unitIds).toEqual([0, 4]);
  expect([queued.x, queued.y, queued.unitIds[0]].every((value) => Object.is(value, 0))).toBe(true);
});

test("a command naming too many units is malformed", () => {
  const queue = createCommandQueue();
  const unitIds = Array.from({ length: MAX_UNIT_IDS + 1 }, (_, index) => index);
  const move = { type: "move", playerId: "red", tick: 0, unitIds, x: 1, y: 1 } as const;
  expect(queue.add(move, 0)).toBe(false);
  expect(queue.add({ ...move, unitIds: unitIds.slice(1) }, 0)).toBe(true);
});

test("the queue refuses commands for a stepped tick or past the horizon", () => {
  const queue = createCommandQueue();
  const move = (tick: number): Command => ({
    type: "move",
    playerId: "red",
    tick,
    unitIds: [worker],
    x: 1,
    y: 1,
  });
  expect(queue.add(move(9), 10)).toBe(false);
  expect(queue.add(move(10 + COMMAND_HORIZON + 1), 10)).toBe(false);
  expect(queue.add(move(10), 10)).toBe(true);
  expect(queue.add(move(10 + COMMAND_HORIZON), 10)).toBe(true);
});

test("commands for a later tick never enter the world", () => {
  const world = skirmishWorld();
  const quiet = skirmishWorld();
  step(world, [{ type: "move", playerId: "red", tick: 5, unitIds: [worker], x: 1, y: 1 }]);
  step(quiet);
  expect(hashWorld(world)).toBe(hashWorld(quiet));
  for (let tick = 1; tick < 10; tick++) step(world);
  expect(entity(world, worker)).toMatchObject({ x: 12, y: 22, order: null });
});

test("commands from two players for one tick apply the same way in either arrival order", () => {
  const build = { type: "build", tick: 0, definitionId: "barracks", x: 18, y: 24 } as const;
  const red: Command = { ...build, playerId: "red", unitIds: [worker] };
  const blue: Command = { ...build, playerId: "blue", unitIds: [ids.blueWorkers[0]] };
  const play = (commands: Command[]) => {
    const world = skirmishWorld();
    step(world, commands);
    return world;
  };
  const world = play([blue, red]);
  expect(hashWorld(world)).toBe(hashWorld(play([red, blue])));
  expect(entity(world, ids.next)).toMatchObject({ definitionId: "barracks", playerId: "red" });
  expect(world.entities).toHaveLength(ids.next);
});

test("the queue gives back a tick's commands once, in the order they arrived", () => {
  const queue = createCommandQueue();
  const move = (playerId: string, tick: number, x: number): Command => ({
    type: "move",
    playerId,
    tick,
    unitIds: [worker],
    x,
    y: 0,
  });
  for (const command of [
    move("blue", 50, 1),
    move("red", 50, 2),
    move("blue", 40, 3),
    move("red", 50, 4),
  ]) {
    queue.add(command, 0);
  }
  const taken = queue.take(50) as Extract<Command, { type: "move" }>[];
  expect(taken.map((command) => command.x)).toEqual([1, 2, 4]);
  expect(queue.take(50)).toEqual([]);
});

test("one player's commands for a tick apply in the order sent, after earlier seats", () => {
  const move = (playerId: string, x: number): Command => ({
    type: "move",
    playerId,
    tick: 0,
    unitIds: [playerId === "red" ? worker : ids.blueWorkers[0]],
    x,
    y: 20,
  });
  const world = skirmishWorld();
  step(world, [move("blue", 30), move("red", 10), move("red", 14)]);
  expect(entity(world, worker).order).toMatchObject({ type: "move", x: 14 });
  expect(entity(world, ids.blueWorkers[0]).order).toMatchObject({ type: "move", x: 30 });
});
