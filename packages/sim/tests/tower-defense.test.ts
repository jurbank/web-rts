import { loadScenario } from "data";
import { expect, test } from "vite-plus/test";
import {
  createWorld,
  hashWorld,
  loadWorld,
  saveWorld,
  step,
  TICK_RATE,
  type Command,
  type World,
} from "../src/index.ts";
import { resources } from "./helpers.ts";
import towerDefense from "./fixtures/tower-defense.json" with { type: "json" };

const LIMIT = 5 * 60 * TICK_RATE;
const BUILDER = 1;

function tower(tick: number, x: number, y: number): Command {
  return { type: "build", playerId: "red", tick, unitIds: [BUILDER], definitionId: "tower", x, y };
}

/** One tower inside each bend of the lane, built one after another. */
const defense = [tower(0, 24, 16.5), tower(180, 12, 8.5), tower(360, 36, 8.5)];

function play(commands: Command[], saveAt?: number): World {
  let world = createWorld(loadScenario(towerDefense), 1);
  while (world.outcome === null && world.tick < LIMIT) {
    if (world.tick === saveAt) world = loadWorld(saveWorld(world));
    step(
      world,
      commands.filter((command) => command.tick === world.tick),
    );
  }
  return world;
}

test("creeps that reach the goal cost lives until the defender loses", () => {
  const world = play([]);
  expect(world.outcome).toEqual({ winningTeam: "creeps" });
  expect(world.variables.lives).toBe(0);
  expect(world.variables.wave).toBeLessThan(5);
  expect(resources(world, "red")).toBe(150);
});

test("towers along the lane survive every wave and earn a bounty for each kill", () => {
  const world = play(defense);
  expect(world.outcome).toEqual({ winningTeam: "red" });
  expect(world.variables).toEqual({ lives: 10, wave: 5, toSpawn: 0 });
  expect(world.players.find((player) => player.id === "creeps")!.defeated).toBe(true);
  expect(resources(world, "red")).toBe(150 - 3 * 50 + 5 * 6 * 10);
});

test("a save and load partway through does not change the result", () => {
  const expected = hashWorld(play(defense));
  for (const saveAt of [1, 15 * TICK_RATE + 7, 40 * TICK_RATE]) {
    expect(hashWorld(play(defense, saveAt))).toBe(expected);
  }
});
