import { loadScenario } from "data";
import { expect, test } from "vite-plus/test";
import {
  createCommandQueue,
  createWorld,
  MAX_COMMANDS_PER_TICK,
  step,
  type Command,
} from "../src/index.ts";
import autoChess from "./fixtures/auto-chess.json" with { type: "json" };
import moba from "./fixtures/moba.json" with { type: "json" };
import { skirmishWorld } from "./helpers.ts";

const concede = (playerId: string): Command => ({ type: "concede", playerId, tick: 0 });

test("a player who concedes is defeated and the other side wins", () => {
  const world = skirmishWorld();
  const events = step(world, [concede("red")]);
  expect(events).toEqual([
    { type: "defeated", playerId: "red" },
    { type: "ended", winningTeam: "blue" },
  ]);
});

/** The MOBA with a second person on the west team, who owns nothing. */
const withTeammate = loadScenario({
  ...moba,
  players: [...moba.players, { id: "green", color: "#30a46c", controller: "human", team: "west" }],
});

test("a team plays on when one of its players concedes", () => {
  const world = createWorld(withTeammate, 1);
  step(world, [concede("red")]);
  expect(world.players.find((player) => player.id === "red")!.defeated).toBe(true);
  expect(world.outcome).toBeNull();
  step(world, [{ type: "move", playerId: "red", tick: 1, unitIds: [1], x: 5, y: 5 }]);
  expect(world.entities.find((entity) => entity.id === 1)!.orders).toEqual([]);
});

test("a team whose only person concedes falls, though its unmanned base stands", () => {
  const world = createWorld(loadScenario(moba), 1);
  const events = step(world, [concede("red")]);
  expect(events).toEqual([
    { type: "defeated", playerId: "red" },
    { type: "defeated", playerId: "redBase" },
    { type: "ended", winningTeam: "east" },
  ]);
});

test("a command rule that refuses every order still lets a player concede", () => {
  const world = createWorld(loadScenario(autoChess), 1);
  world.variables.phase = 1;
  step(world, [concede("red")]);
  expect(world.outcome).toEqual({ winningTeam: "blue" });
});

test("the outcome names the winning team, not one of its players", () => {
  const world = createWorld(
    loadScenario({
      ...moba,
      players: [
        { id: "redBase", color: "#b03a3e", controller: "none", team: "west" },
        ...moba.players.filter((player) => player.id !== "redBase"),
      ],
    }),
    1,
  );
  step(world, [concede("blue")]);
  const blueBase = world.entities.filter((entity) => entity.playerId === "blueBase");
  for (const entity of blueBase) entity.health = 0;
  for (let tick = 0; tick < 3 && world.outcome === null; tick++) step(world);
  expect(world.outcome).toEqual({ winningTeam: "west" });
});

test("seats say who sits where, and a nobody seat stays nobody", () => {
  const world = createWorld(loadScenario(moba), 1, {
    red: "ai",
    redBase: "human",
    stranger: "human",
  });
  const controllers = Object.fromEntries(
    world.players.map((player) => [player.id, player.controller]),
  );
  expect(controllers).toEqual({ red: "ai", blue: "ai", redBase: "none", blueBase: "none" });
});

test("the queue holds a bounded number of commands for each player on a tick", () => {
  const queue = createCommandQueue();
  const accepted = (playerId: string) =>
    Array.from({ length: MAX_COMMANDS_PER_TICK + 1 }, () =>
      queue.add({ type: "concede", playerId, tick: 3 }, 0),
    ).filter(Boolean).length;
  expect([accepted("red"), accepted("blue")]).toEqual([
    MAX_COMMANDS_PER_TICK,
    MAX_COMMANDS_PER_TICK,
  ]);
});
