import { loadScenario, type Scenario } from "data";
import { expect, test } from "vite-plus/test";
import {
  createWorld,
  hashWorld,
  loadWorld,
  saveWorld,
  step,
  takeSnapshot,
  type Choices,
  type World,
} from "../src/index.ts";

/** Two seats and a neutral owner, a hero spot each, and a hero option of three. */
function scenario(edit: (raw: Record<string, any>) => void = () => {}): Scenario {
  const raw: Record<string, any> = {
    formatVersion: 11,
    map: { width: 40, height: 20 },
    players: [
      { id: "red", color: "#ff0000", controller: "human", team: "west" },
      { id: "blue", color: "#0000ff", controller: "human", team: "east" },
    ],
    definitions: ["duelist", "ranger", "brute", "marker"].map((id) => ({
      id,
      name: id,
      radius: 0.5,
      maxHealth: 10,
      speed: 4,
    })),
    placements: [
      { definitionId: "duelist", definitionFrom: "hero", playerId: "red", x: 5, y: 10 },
      { definitionId: "duelist", definitionFrom: "hero", playerId: "blue", x: 35, y: 10 },
    ],
    waypoints: [{ id: "middle", x: 20, y: 10 }],
    options: [
      {
        id: "hero",
        name: "Hero",
        scope: "player",
        choices: [
          { id: "duelist", name: "Duelist" },
          { id: "ranger", name: "Ranger" },
          { id: "brute", name: "Brute" },
        ],
      },
      {
        id: "mode",
        name: "Mode",
        scope: "match",
        choices: [
          { id: "calm", name: "Calm" },
          { id: "wild", name: "Wild" },
        ],
        default: "random",
      },
    ],
  };
  edit(raw);
  return loadScenario(raw);
}

const heroes = (world: World) => world.entities.map((entity) => entity.definitionId);

test("each seat's hero placement starts as the hero it chose", () => {
  const world = createWorld(scenario(), 1, {}, { hero: { red: "brute", blue: "ranger" } });
  expect(heroes(world)).toEqual(["brute", "ranger"]);
});

test("a missing or unknown choice takes the option's default", () => {
  const world = createWorld(scenario(), 1, {}, { hero: { red: "dragon" } });
  expect(heroes(world)).toEqual(["duelist", "duelist"]);
});

test("random choices come from the seed, so every device draws the same", () => {
  const choices: Choices = { hero: { red: "random", blue: "random" } };
  const draws = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const first = createWorld(scenario(), seed, {}, choices);
    const again = createWorld(scenario(), seed, {}, choices);
    expect(heroes(again)).toEqual(heroes(first));
    expect(again.choices).toEqual(first.choices);
    draws.add(heroes(first)[0]);
    draws.add(first.choices.mode as string);
  }
  expect(draws).toEqual(new Set(["duelist", "ranger", "brute", "calm", "wild"]));
});

test("random choices leave the match's own random stream alone", () => {
  const fixed = createWorld(scenario(), 7, {}, { hero: { red: "brute", blue: "brute" } });
  const drawn = createWorld(scenario(), 7, {}, { hero: { red: "random", blue: "random" } });
  expect(drawn.rngState).toBe(fixed.rngState);
});

test("choices are world state: saved, hashed, and in every snapshot", () => {
  const brute = createWorld(scenario(), 1, {}, { hero: { red: "brute" }, mode: "calm" });
  const ranger = createWorld(scenario(), 1, {}, { hero: { red: "ranger" }, mode: "calm" });
  expect(hashWorld(brute)).not.toBe(hashWorld(ranger));
  expect(loadWorld(saveWorld(brute)).choices).toEqual(brute.choices);
  expect(takeSnapshot(brute, "blue").choices).toEqual({
    hero: { red: "brute", blue: "duelist" },
    mode: "calm",
  });
});

test("triggers read a choice, and a spawn can take its definition from one", () => {
  const world = createWorld(
    scenario((raw) => {
      raw.triggers = [
        {
          id: "wild-start",
          event: { type: "start" },
          conditions: [{ type: "option", option: "mode", choice: "wild" }],
          actions: [
            {
              type: "spawn",
              definitionId: "marker",
              definitionFrom: "hero",
              playerId: "blue",
              at: "middle",
            },
          ],
        },
      ];
    }),
    1,
    {},
    { hero: { blue: "ranger" }, mode: "wild" },
  );
  step(world, []);
  expect(heroes(world)).toEqual(["duelist", "ranger", "ranger"]);
});
