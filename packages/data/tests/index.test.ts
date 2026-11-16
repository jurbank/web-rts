import { expect, test } from "vite-plus/test";
import { FORMAT_VERSION, loadScenario, scenarioSchema } from "../src/index.ts";
import skirmish from "./fixtures/skirmish.json" with { type: "json" };

function fixture(): Record<string, any> {
  return JSON.parse(JSON.stringify(skirmish));
}

function issues(scenario: unknown): string[] {
  const result = scenarioSchema.safeParse(scenario);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

test("round trip yields equal data", () => {
  const first = loadScenario(fixture());
  const second = loadScenario(JSON.parse(JSON.stringify(first)));
  expect(second).toEqual(first);
});

test("fills defaults for omitted fields", () => {
  const scenario = loadScenario(fixture());
  expect(scenario.placements[4].playerId).toBeNull();
  expect(scenario.definitions[5]).toMatchObject({
    cost: 0,
    dropOff: false,
    produces: [],
    builds: [],
  });
});

test("rejects a missing or newer format version", () => {
  const { formatVersion: _, ...unversioned } = fixture();
  expect(() => loadScenario(unversioned)).toThrow("formatVersion");
  expect(() => loadScenario({ ...fixture(), formatVersion: FORMAT_VERSION + 1 })).toThrow("newer");
});

test("rejects references to unknown ids", () => {
  const scenario = fixture();
  scenario.placements[0].definitionId = "ghost";
  scenario.placements[1].playerId = "green";
  scenario.definitions[0].builds = ["castle"];
  scenario.victory.definitionIds = ["throne"];
  expect(issues(scenario).sort()).toEqual([
    'Unknown definition "castle"',
    'Unknown definition "ghost"',
    'Unknown definition "throne"',
    'Unknown player "green"',
  ]);
});

test("rejects duplicate ids and placements outside the map", () => {
  const scenario = fixture();
  scenario.definitions.push({ id: "rock", name: "Rock", radius: 1 });
  scenario.placements[0].x = 65;
  scenario.players[0].start = { x: 8, y: 49 };
  expect(issues(scenario)).toEqual([
    'Duplicate id "rock"',
    "Start point is outside the map",
    "Placement is outside the map",
  ]);
});

test("rejects ids that do not start with a letter", () => {
  for (const id of ["", "__proto__", "1st", "has space"]) {
    const scenario = fixture();
    scenario.definitions[5].id = id;
    expect(issues(scenario)).not.toEqual([]);
  }
});

test("an ai player needs ai settings", () => {
  const scenario = fixture();
  delete scenario.players[1].ai;
  expect(issues(scenario)).toEqual(["An ai player needs ai settings"]);
});
