import { expect, test } from "vite-plus/test";
import { step, TICK_RATE } from "../src/index.ts";
import { ids, skirmishWorld } from "./helpers.ts";

const LIMIT = 20 * 60 * TICK_RATE;

test("the ai gathers, builds a barracks, trains soldiers, and defeats an idle opponent", () => {
  const world = skirmishWorld({ ai: true });
  const seen = new Set<string>();
  while (world.outcome === null && world.tick < LIMIT) {
    for (const event of step(world)) seen.add(event.type);
  }
  expect(world.outcome).toEqual({ winnerId: "blue" });
  expect([...seen].sort()).toEqual(["completed", "defeated", "died", "ended", "produced"]);
  expect(world.players.find((player) => player.id === "red")!.defeated).toBe(true);
  expect(world.entities.some((entity) => entity.id === ids.redHq)).toBe(false);
});

test("a decided game stops advancing", () => {
  const world = skirmishWorld({
    edit(raw) {
      raw.placements = raw.placements.filter(
        (placement: { playerId?: string }) => placement.playerId !== "blue",
      );
    },
  });
  expect(step(world)).toEqual([
    { type: "defeated", playerId: "blue" },
    { type: "ended", winnerId: "red" },
  ]);
  expect(step(world)).toEqual([]);
  expect(world.tick).toBe(1);
});

test("destroyAll keeps a player alive while anything of theirs has health", () => {
  const world = skirmishWorld({
    edit(raw) {
      raw.victory = { type: "destroyAll" };
      raw.placements = raw.placements.filter(
        (placement: { playerId?: string; definitionId: string }) =>
          !(placement.playerId === "blue" && placement.definitionId === "hq"),
      );
    },
  });
  step(world);
  expect(world.outcome).toBeNull();
});
