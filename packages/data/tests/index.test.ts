import { expect, test } from "vite-plus/test";
import { FORMAT_VERSION, loadScenario, scenarioSchema } from "../src/index.ts";
import skirmishV1 from "./fixtures/skirmish-v1.json" with { type: "json" };
import skirmishV2 from "./fixtures/skirmish-v2.json" with { type: "json" };
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
  scenario.triggers[0].event.definitionIds = ["throne"];
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

test("format 1 migrates its victory condition into a trigger", () => {
  expect(loadScenario(JSON.parse(JSON.stringify(skirmishV1)))).toEqual(loadScenario(fixture()));

  const destroyAll = { ...JSON.parse(JSON.stringify(skirmishV1)), victory: { type: "destroyAll" } };
  expect(loadScenario(destroyAll).triggers).toEqual([
    {
      id: "victory",
      event: { type: "died" },
      conditions: [{ type: "count", playerId: "$triggering", op: "==", value: 0 }],
      actions: [{ type: "defeat", playerId: "$triggering" }],
    },
  ]);
});

test("format 2 loads unchanged", () => {
  expect(loadScenario(JSON.parse(JSON.stringify(skirmishV2)))).toEqual(loadScenario(fixture()));
});

test("abilities need unique ids, and a range to target an enemy", () => {
  const scenario = fixture();
  const bolt = { id: "bolt", name: "Bolt", cooldown: 5, effects: [{ type: "damage", amount: 5 }] };
  scenario.definitions[0].abilities = [
    { ...bolt, target: "enemy" },
    { ...bolt, target: "self" },
  ];
  expect(issues(scenario)).toEqual([
    "An ability that targets an enemy needs a range",
    'Duplicate id "bolt"',
  ]);
});

/** The fixture with map logic added: a timer, a region, waypoints, a path, and a variable. */
function withLogic(): Record<string, any> {
  return {
    ...fixture(),
    variables: [{ id: "lives", value: 3 }],
    timers: [{ id: "wave", seconds: 10, repeat: true }],
    regions: [{ id: "goal", x: 60, y: 20, width: 4, height: 8 }],
    waypoints: [
      { id: "spawn", x: 1, y: 24 },
      { id: "exit", x: 62, y: 24 },
    ],
    paths: [{ id: "lane", waypoints: ["spawn", "exit"] }],
  };
}

test("validates trigger references and fills defaults", () => {
  const scenario = withLogic();
  scenario.triggers.push(
    {
      id: "wave",
      event: { type: "timer", timer: "wave" },
      actions: [
        { type: "spawn", definitionId: "soldier", playerId: "blue", at: "spawn", path: "lane" },
      ],
    },
    {
      id: "leak",
      event: { type: "entered", region: "goal", playerId: "blue" },
      actions: [
        { type: "remove", entity: "$triggering" },
        { type: "addVariable", variable: "lives", value: -1 },
      ],
    },
  );
  const loaded = loadScenario(scenario);
  expect(loaded.triggers[1]).toMatchObject({ conditions: [], actions: [{ count: 1 }] });
  expect(loadScenario(JSON.parse(JSON.stringify(loaded)))).toEqual(loaded);
});

test("rejects trigger references that name nothing", () => {
  const scenario = withLogic();
  scenario.paths[0].waypoints.push("nowhere");
  scenario.triggers.push({
    id: "broken",
    event: { type: "timer", timer: "clock" },
    conditions: [{ type: "variable", variable: "gold", op: ">", value: 0 }],
    actions: [
      { type: "spawn", definitionId: "dragon", playerId: "green", at: "gate", path: "road" },
      { type: "startTimer", timer: "clock" },
    ],
  });
  expect(issues(scenario).sort()).toEqual([
    'Unknown definition "dragon"',
    'Unknown path "road"',
    'Unknown player "green"',
    'Unknown timer "clock"',
    'Unknown timer "clock"',
    'Unknown variable "gold"',
    'Unknown waypoint "gate"',
    'Unknown waypoint "nowhere"',
  ]);
});

test("only died and entered events have a triggering entity", () => {
  const scenario = withLogic();
  scenario.triggers.push({
    id: "early",
    event: { type: "start" },
    actions: [
      { type: "defeat", playerId: "$triggering" },
      { type: "remove", entity: "$triggering" },
    ],
  });
  expect(issues(scenario)).toEqual([
    "Only died and entered events have a triggering entity",
    "Only died and entered events have a triggering entity",
  ]);
});

test("rejects regions and waypoints outside the map and duplicate trigger ids", () => {
  const scenario = withLogic();
  scenario.regions[0].width = 5;
  scenario.waypoints[0].x = -1;
  scenario.triggers.push({ ...scenario.triggers[0] });
  expect(issues(scenario)).toEqual([
    'Duplicate id "victory"',
    "Region is outside the map",
    "Waypoint is outside the map",
  ]);
});
