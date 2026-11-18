import { loadScenario } from "data";
import { readVictory } from "editor";
import { createWorld, step, TICK_RATE } from "sim";
import { expect, test } from "vite-plus/test";
import raw from "../src/scenarios/three-lane-moba.json" with { type: "json" };
import { seatOnePerson } from "../src/seating.ts";

const scenario = loadScenario(raw);

test("both teams' waves fight in three separate lanes during a solo playtest", () => {
  const world = createWorld(scenario, 1, seatOnePerson(scenario).seats);
  const fights = new Set<string>();
  const crossings = [
    { lane: "Top", waypoint: "topBend" },
    { lane: "Mid", waypoint: "midCross" },
    { lane: "Bot", waypoint: "botBend" },
  ];
  for (let tick = 0; tick < 40 * TICK_RATE; tick++) {
    step(world);
    for (const unit of world.entities) {
      const [attack, path] = unit.orders;
      if (attack?.type !== "attack" || path?.type !== "path") continue;
      for (const { lane, waypoint } of crossings) {
        const point = world.waypoints[waypoint];
        if (Math.hypot(unit.x - point.x, unit.y - point.y) < 7) {
          fights.add(`${unit.playerId}/${lane}`);
        }
      }
    }
  }
  expect([...fights].sort()).toEqual([
    "blueBase/Bot",
    "blueBase/Mid",
    "blueBase/Top",
    "redBase/Bot",
    "redBase/Mid",
    "redBase/Top",
  ]);
});

test("losing the last tower brings siege rams, then a core falls in normal combat", () => {
  const world = createWorld(scenario, 1, { red: "ai", blue: "ai" });
  const rams = new Set<number>();
  let fallenCore: string | null = null;
  for (let tick = 0; tick < 5 * 60 * TICK_RATE && world.outcome === null; tick++) {
    for (const event of step(world)) {
      if (event.type === "died" && event.definitionId === "ancient") fallenCore = event.playerId;
    }
    for (const unit of world.entities) {
      if (unit.definitionId !== "ram" || rams.has(unit.id)) continue;
      rams.add(unit.id);
      const enemy = unit.playerId === "redBase" ? "blueBase" : "redBase";
      expect(
        world.entities.some((other) => other.playerId === enemy && other.definitionId === "tower"),
      ).toBe(false);
    }
  }
  expect(rams.size).toBeGreaterThan(0);
  expect(["red", "blue"]).toContain(fallenCore);
  expect(world.outcome).toEqual({ winningTeam: fallenCore === "red" ? "east" : "west" });
});

test("simultaneous core losses draw under the editor's core victory rule", () => {
  expect(readVictory(scenario)).toEqual({ type: "destroyDefinitions", definitionIds: ["ancient"] });
  const world = createWorld(scenario, 1, seatOnePerson(scenario).seats);
  for (const core of world.entities.filter((unit) => unit.definitionId === "ancient")) {
    core.health = 0;
  }
  step(world);
  expect(world.outcome).toEqual({ winningTeam: null });
});
