import { loadScenario } from "data";
import { expect, test } from "vite-plus/test";
import { createWorld, step, TICK_RATE, type World } from "../src/index.ts";
import { entity, ids, resources, run, skirmishWorld } from "./helpers.ts";

type Raw = Record<string, any>;

/** A small empty map with two players, a runner, and whatever logic `edit` adds. */
function logicWorld(edit: (raw: Raw) => void): World {
  const raw: Raw = {
    formatVersion: 2,
    map: { width: 40, height: 20 },
    players: [
      { id: "red", color: "#ff0000", controller: "human", resources: 10 },
      { id: "foe", color: "#0000ff", controller: "none" },
    ],
    definitions: [
      { id: "runner", name: "Runner", radius: 0.5, maxHealth: 10, speed: 6 },
      { id: "post", name: "Post", radius: 0.5, maxHealth: 10 },
    ],
    placements: [{ definitionId: "post", playerId: "red", x: 35, y: 10 }],
    variables: [{ id: "count", value: 0 }],
    timers: [],
    regions: [{ id: "goal", x: 30, y: 5, width: 8, height: 10 }],
    waypoints: [
      { id: "west", x: 2, y: 10 },
      { id: "middle", x: 20, y: 2 },
      { id: "east", x: 34, y: 10 },
    ],
    paths: [{ id: "lane", waypoints: ["middle", "east"] }],
    triggers: [],
  };
  edit(raw);
  return createWorld(loadScenario(raw), 1);
}

function kill(world: World, id: number): void {
  entity(world, id).health = 0;
}

test("the fixture's victory trigger defeats a player who loses their last hq", () => {
  const world = skirmishWorld();
  kill(world, ids.blueHq);
  expect(step(world)).toEqual([
    expect.objectContaining({ type: "died", id: ids.blueHq, definitionId: "hq", playerId: "blue" }),
    { type: "defeated", playerId: "blue" },
    { type: "ended", winningTeam: "red" },
  ]);
  expect(step(world)).toEqual([]);
  expect(world.tick).toBe(1);
});

test("without a definition filter, anything a player still owns keeps them in the game", () => {
  const world = skirmishWorld({
    edit(raw) {
      delete raw.triggers[0].event.definitionIds;
      delete raw.triggers[0].conditions[0].definitionIds;
    },
  });
  kill(world, ids.blueHq);
  step(world);
  expect(world.outcome).toBeNull();
  for (const id of ids.blueWorkers) kill(world, id);
  step(world);
  expect(world.outcome).toEqual({ winningTeam: "red" });
});

test("win defeats everyone else and ends the game", () => {
  const world = logicWorld((raw) => {
    raw.triggers.push({
      id: "instant",
      event: { type: "start" },
      actions: [{ type: "win", playerId: "foe" }],
    });
  });
  expect(step(world)).toEqual([
    { type: "defeated", playerId: "red" },
    { type: "ended", winningTeam: "foe" },
  ]);
});

test("a repeating timer fires every period and a one-shot timer fires once", () => {
  const world = logicWorld((raw) => {
    raw.variables.push({ id: "once", value: 0 });
    raw.timers.push({ id: "tick", seconds: 1, repeat: true }, { id: "later", seconds: 2 });
    raw.triggers.push(
      {
        id: "begin",
        event: { type: "start" },
        actions: [
          { type: "startTimer", timer: "tick" },
          { type: "startTimer", timer: "later" },
        ],
      },
      {
        id: "count",
        event: { type: "timer", timer: "tick" },
        actions: [{ type: "addVariable", variable: "count", value: 1 }],
      },
      {
        id: "once",
        event: { type: "timer", timer: "later" },
        actions: [{ type: "addVariable", variable: "once", value: 1 }],
      },
    );
  });
  run(world, TICK_RATE);
  expect(world.variables).toEqual({ count: 0, once: 0 });
  run(world, 1);
  expect(world.variables).toEqual({ count: 1, once: 0 });
  run(world, 5 * TICK_RATE);
  expect(world.variables).toEqual({ count: 6, once: 1 });
});

test("spawned units walk a path, enter a region once, and can be removed by a trigger", () => {
  const world = logicWorld((raw) => {
    raw.triggers.push(
      {
        id: "send",
        event: { type: "start" },
        actions: [
          { type: "spawn", definitionId: "runner", playerId: "foe", at: "west", path: "lane" },
        ],
      },
      {
        id: "arrive",
        event: { type: "entered", region: "goal", playerId: "foe" },
        conditions: [{ type: "count", playerId: "$triggering", op: "==", value: 1 }],
        actions: [
          { type: "addVariable", variable: "count", value: 1 },
          { type: "grantResources", playerId: "red", amount: -25 },
          { type: "remove", entity: "$triggering" },
        ],
      },
    );
  });
  const runnerId = 2;
  run(world, 1);
  expect(entity(world, runnerId)).toMatchObject({
    x: 2,
    y: 10,
    orders: [{ type: "path", pathId: "lane", next: 0 }],
  });

  let passedMiddle = false;
  while (world.variables.count === 0 && world.tick < 20 * TICK_RATE) {
    step(world);
    const runner = world.entities.find((candidate) => candidate.id === runnerId);
    if (runner !== undefined && runner.y < 2.5) passedMiddle = true;
  }
  expect(passedMiddle).toBe(true);
  expect(world.variables.count).toBe(1);
  expect(world.entities.map((candidate) => candidate.id)).toEqual([1]);
  expect(resources(world, "red")).toBe(0);
  // The post was placed inside the region and never entered it.
  run(world, TICK_RATE);
  expect(world.variables.count).toBe(1);
});

test("a died event names the dead entity's owner", () => {
  const world = logicWorld((raw) => {
    raw.placements.push({ definitionId: "runner", playerId: "foe", x: 5, y: 5 });
    raw.triggers.push({
      id: "bounty",
      event: { type: "died", definitionIds: ["runner"] },
      actions: [{ type: "defeat", playerId: "$triggering" }],
    });
  });
  kill(world, 2);
  expect(step(world)).toEqual([
    { type: "died", id: 2, definitionId: "runner", playerId: "foe", x: 5, y: 5 },
    { type: "defeated", playerId: "foe" },
    { type: "ended", winningTeam: "red" },
  ]);
});

test("a player nobody controls ignores commands", () => {
  const world = logicWorld((raw) => {
    raw.placements.push({ definitionId: "runner", playerId: "foe", x: 5, y: 5 });
  });
  run(world, 10, [{ type: "move", playerId: "foe", tick: 0, unitIds: [2], x: 20, y: 5 }]);
  expect(entity(world, 2)).toMatchObject({ x: 5, y: 5, orders: [] });
});
