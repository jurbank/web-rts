import { expect, test } from "vite-plus/test";
import { step, TICK_RATE } from "../src/index.ts";
import { ids, skirmishWorld } from "./helpers.ts";

const LIMIT = 20 * 60 * TICK_RATE;

test("the ai gathers, builds a barracks, trains soldiers, researches, and defeats an idle opponent", () => {
  const world = skirmishWorld({ ai: true, fog: true });
  const seen = new Set<string>();
  let scouted = false;
  while (world.outcome === null && world.tick < LIMIT) {
    for (const event of step(world)) seen.add(event.type);
    if (!scouted)
      scouted = world.entities.some(
        (unit) =>
          unit.playerId === "blue" && unit.orders.some((order) => order.type === "attackMove"),
      );
  }
  expect(scouted).toBe(true);
  expect(world.outcome).toEqual({ winningTeam: "blue" });
  expect([...seen].sort()).toEqual([
    "completed",
    "defeated",
    "died",
    "ended",
    "fired",
    "produced",
    "researched",
  ]);
  expect(world.players.find((player) => player.id === "red")!.defeated).toBe(true);
  expect(world.entities.some((entity) => entity.id === ids.redHq)).toBe(false);
});
