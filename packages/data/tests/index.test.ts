import { expect, test } from "vite-plus/test";
import { FORMAT_VERSION, loadScenario, scenarioSchema } from "../src/index.ts";
import skirmish from "./fixtures/skirmish.json" with { type: "json" };

function fixture(): Record<string, any> {
  return JSON.parse(JSON.stringify(skirmish));
}

test("round trip yields equal data", () => {
  const first = loadScenario(fixture());
  const second = loadScenario(JSON.parse(JSON.stringify(first)));
  expect(second).toEqual(first);
});

test("rejects a missing or newer format version", () => {
  const { formatVersion: _, ...unversioned } = fixture();
  expect(() => loadScenario(unversioned)).toThrow("formatVersion");
  expect(() => loadScenario({ ...fixture(), formatVersion: FORMAT_VERSION + 1 })).toThrow("newer");
});

function issues(scenario: unknown): string[] {
  const result = scenarioSchema.safeParse(scenario);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

test("rejects placements that reference unknown ids", () => {
  const scenario = fixture();
  scenario.placements[0].definitionId = "ghost";
  scenario.placements[1].playerId = "green";
  expect(issues(scenario)).toEqual(['Unknown unit definition "ghost"', 'Unknown player "green"']);
});

test("rejects duplicate ids and placements outside the map", () => {
  const scenario = fixture();
  scenario.players.push({ id: "red", color: "#000000" });
  scenario.placements[0].x = 65;
  expect(issues(scenario)).toEqual(['Duplicate id "red"', "Placement is outside the map"]);
});

test("rejects ids that do not start with a letter", () => {
  for (const id of ["", "__proto__", "1st", "has space"]) {
    const scenario = fixture();
    scenario.unitDefinitions[0].id = id;
    expect(issues(scenario)).not.toEqual([]);
  }
});
