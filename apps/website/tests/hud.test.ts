import { loadScenario } from "data";
import { createWorld, step, takeSnapshot, type Command } from "sim";
import { expect, test } from "vite-plus/test";
import { buildHudView } from "../src/hud.ts";
import autoChess from "../src/scenarios/auto-chess.json";
import moba from "../src/scenarios/moba.json";
import skirmish from "../src/scenarios/skirmish.json";
import towerDefense from "../src/scenarios/tower-defense.json";

const scenario = loadScenario(skirmish);

function view(selectedIds: number[], commands: Command[] = [], ticks = 1) {
  const world = createWorld(scenario, 1);
  step(world, commands);
  for (let i = 1; i < ticks; i++) step(world);
  return buildHudView({
    scenario,
    snapshot: takeSnapshot(world),
    localPlayerId: "red",
    selectedIds,
    placingId: null,
    targetingId: null,
    notice: null,
  });
}

test("nothing selected shows resources and no actions", () => {
  expect(view([])).toMatchObject({ resources: 200, selection: null, actions: [], outcome: null });
});

test("a selected building offers what it trains and shows its queue", () => {
  const produce: Command = {
    type: "produce",
    playerId: "red",
    tick: 0,
    buildingId: 1,
    definitionId: "worker",
  };
  const hud = view([1], [produce, produce], 61);
  expect(hud.resources).toBe(100);
  expect(hud.selection).toBe("Headquarters · 1500/1500");
  expect(hud.actions).toEqual([
    { kind: "produce", definitionId: "worker", label: "Worker", cost: 50, enabled: true },
  ]);
  expect(hud.queue).toEqual([
    { label: "Worker", percent: 50 },
    { label: "Worker", percent: 0 },
  ]);
});

test("selected builders offer what they build, disabled when it costs too much", () => {
  const produce: Command = {
    type: "produce",
    playerId: "red",
    tick: 0,
    buildingId: 1,
    definitionId: "worker",
  };
  expect(view([2, 3]).actions).toEqual([
    { kind: "build", definitionId: "barracks", label: "Barracks", cost: 150, enabled: true },
  ]);
  expect(view([2, 3], [produce, produce])).toMatchObject({
    selection: "2 units",
    actions: [{ definitionId: "barracks", enabled: false }],
  });
});

test("the outcome is reported from the local player's side", () => {
  const snapshot = takeSnapshot(createWorld(scenario, 1));
  const outcome = (winningTeam: string | null) =>
    buildHudView({
      scenario,
      snapshot: { ...snapshot, outcome: { winningTeam } },
      localPlayerId: "red",
      selectedIds: [],
      placingId: null,
      targetingId: null,
      notice: null,
    }).outcome;
  expect([outcome("red"), outcome("blue"), outcome(null)]).toEqual(["won", "lost", "draw"]);
});

test("a player out of a game that goes on is told whether their team plays on", () => {
  const outcomeAfterRedConcedes = (extra: Record<string, unknown>) => {
    const scenario = loadScenario({
      ...moba,
      players: [...moba.players, { color: "#30a46c", controller: "human", ...extra }],
    });
    const world = createWorld(scenario, 1);
    step(world, [{ type: "concede", playerId: "red", tick: 0 }]);
    expect(world.outcome).toBeNull();
    return buildHudView({
      scenario,
      snapshot: takeSnapshot(world),
      localPlayerId: "red",
      selectedIds: [],
      placingId: null,
      targetingId: null,
      notice: null,
    }).outcome;
  };
  expect(outcomeAfterRedConcedes({ id: "green", team: "west" })).toBe("defeated");
  expect(outcomeAfterRedConcedes({ id: "gold" })).toBe("out");
});

test("labelled scenario variables show as counters", () => {
  const defense = loadScenario(towerDefense);
  const world = createWorld(defense, 1);
  step(world);
  const hud = buildHudView({
    scenario: defense,
    snapshot: takeSnapshot(world),
    localPlayerId: "red",
    selectedIds: [],
    placingId: null,
    targetingId: null,
    notice: null,
  });
  expect(hud.counters).toEqual([
    { label: "Lives", value: 10 },
    { label: "Wave", value: 0 },
  ]);
});

test("a selected hero shows its level and what it can cast", () => {
  const scenario = loadScenario(moba);
  const world = createWorld(scenario, 1);
  step(world, [
    { type: "cast", playerId: "red", tick: 0, unitId: 1, abilityId: "bolt", targetId: 2 },
  ]);
  world.entities[0].abilityCooldowns[0] = 75;
  const hud = buildHudView({
    scenario,
    snapshot: takeSnapshot(world),
    localPlayerId: "red",
    selectedIds: [1],
    placingId: null,
    targetingId: "bolt",
    notice: null,
  });
  expect(hud.selection).toBe("Hero · level 1 · 300/300");
  expect(hud.abilities).toEqual([
    { id: "bolt", label: "Bolt", seconds: 3, locked: null, cost: 0, enabled: false },
    { id: "sprint", label: "Sprint", seconds: 0, locked: 2, cost: 0, enabled: false },
    { id: "blade", label: "Blade", seconds: 0, locked: null, cost: 150, enabled: false },
    { id: "boots", label: "Boots", seconds: 0, locked: null, cost: 100, enabled: false },
  ]);
  expect(hud.targeting).toBe("bolt");
});

test("a purchase is enabled only when the hero can pay and stands by its shop", () => {
  const scenario = loadScenario(moba);
  const world = createWorld(scenario, 1);
  world.players[0].resources = 120;
  const enabled = () =>
    buildHudView({
      scenario,
      snapshot: takeSnapshot(world),
      localPlayerId: "red",
      selectedIds: [1],
      placingId: null,
      targetingId: null,
      notice: null,
    }).abilities.map((ability) => ability.enabled);
  expect(enabled()).toEqual([true, false, false, true]);
  world.entities[0].x = 20;
  expect(enabled()).toEqual([true, false, false, false]);
});

test("a teammate's win is a win", () => {
  const scenario = loadScenario(moba);
  const world = createWorld(scenario, 1);
  world.entities.find((entity) => entity.playerId === "blueBase")!.health = 0;
  step(world);
  const hud = buildHudView({
    scenario,
    snapshot: takeSnapshot(world),
    localPlayerId: "red",
    selectedIds: [],
    placingId: null,
    targetingId: null,
    notice: null,
  });
  expect(world.outcome).toEqual({ winningTeam: "west" });
  expect(hud.outcome).toBe("won");
});

test("the shop is always on screen, with planning time left, and greys out in combat", () => {
  const scenario = loadScenario(autoChess);
  const world = createWorld(scenario, 1);
  const hud = () =>
    buildHudView({
      scenario,
      snapshot: takeSnapshot(world),
      localPlayerId: "red",
      selectedIds: [],
      placingId: null,
      targetingId: null,
      notice: null,
    });
  step(world);
  const offers = world.entities[0].offers;
  expect(hud().counters).toEqual([
    { label: "Round", value: 1 },
    { label: "Red lives", value: 3 },
    { label: "Blue lives", value: 3 },
    { label: "Planning", value: 20 },
  ]);
  expect(hud().shop).toEqual({
    buildingId: 1,
    offers: offers.map((id, slot) => ({
      slot,
      definitionId: id,
      label: scenario.definitions.find((definition) => definition.id === id)!.name,
      cost: id === "brute" ? 5 : 3,
      enabled: true,
    })),
    abilities: [
      { id: "reroll", label: "Reroll", seconds: 0, locked: null, cost: 2, enabled: true },
    ],
  });

  step(world, [
    { type: "produce", playerId: "red", tick: 1, buildingId: 1, definitionId: offers[1]! },
  ]);
  expect(hud().shop!.offers.map((offer) => offer.slot)).toEqual([0, 2]);

  world.variables.phase = 1;
  expect(hud().shop!.offers.every((offer) => !offer.enabled)).toBe(true);
  expect(hud().shop!.abilities[0].enabled).toBe(false);
});

test("units that move get order buttons, and groups count the player's units left", () => {
  expect(view([1]).orders).toBeNull();
  // Workers move but carry no weapon.
  expect(view([2, 3]).orders).toEqual({ attack: false, patrol: true, hold: true, stop: true });

  const world = createWorld(scenario, 1);
  const hud = buildHudView({
    scenario,
    snapshot: takeSnapshot(world),
    localPlayerId: "red",
    selectedIds: [],
    placingId: null,
    targetingId: null,
    notice: null,
    groups: [
      { number: 1, ids: [2, 3, 8, 999] },
      { number: 4, ids: [999] },
    ],
  });
  expect(hud.groups).toEqual([{ number: 1, count: 2 }]);
});
