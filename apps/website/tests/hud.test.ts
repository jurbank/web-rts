import { loadScenario } from "data";
import { createWorld, step, takeSnapshot, type Command } from "sim";
import { expect, test } from "vite-plus/test";
import { buildHudView } from "../src/hud.ts";
import skirmish from "../src/scenarios/skirmish.json";

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
  const outcome = (winnerId: string | null) =>
    buildHudView({
      scenario,
      snapshot: { ...snapshot, outcome: { winnerId } },
      localPlayerId: "red",
      selectedIds: [],
      placingId: null,
      notice: null,
    }).outcome;
  expect([outcome("red"), outcome("blue"), outcome(null)]).toEqual(["won", "lost", "draw"]);
});
