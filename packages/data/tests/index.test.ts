import { expect, test } from "vite-plus/test";
import { FORMAT_VERSION, loadScenario, scenarioSchema } from "../src/index.ts";
import mobaV3 from "./fixtures/moba-v3.json" with { type: "json" };
import mobaV4 from "./fixtures/moba-v4.json" with { type: "json" };
import autoChessV5 from "./fixtures/auto-chess-v5.json" with { type: "json" };
import skirmishV6 from "./fixtures/skirmish-v6.json" with { type: "json" };
import skirmishV7 from "./fixtures/skirmish-v7.json" with { type: "json" };
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

test("format 3 loads unchanged", () => {
  const v3 = JSON.parse(JSON.stringify(mobaV3));
  expect(loadScenario(v3)).toEqual(loadScenario({ ...v3, formatVersion: FORMAT_VERSION }));
});

test("format 4 loads unchanged", () => {
  const v4 = JSON.parse(JSON.stringify(mobaV4));
  expect(loadScenario(v4)).toEqual(loadScenario({ ...v4, formatVersion: FORMAT_VERSION }));
});

test("format 5 loads unchanged", () => {
  const v5 = JSON.parse(JSON.stringify(autoChessV5));
  expect(loadScenario(v5)).toEqual(loadScenario({ ...v5, formatVersion: FORMAT_VERSION }));
});

test("format 6 adds the new movement commands to rules that kept units still", () => {
  const v5 = JSON.parse(JSON.stringify(autoChessV5));
  const conditions = v5.commandRules[0].conditions;
  v5.commandRules = [
    { commands: ["move", "produce"], conditions },
    { commands: ["attack"], conditions },
    { commands: ["produce"], conditions },
    { conditions },
  ];
  expect(loadScenario(v5).commandRules.map((rule) => rule.commands)).toEqual([
    // Format 8 then adds research wherever produce was refused.
    ["move", "produce", "patrol", "hold", "stop", "research"],
    ["attack", "patrol"],
    ["produce", "research"],
    undefined,
  ]);
});

test("format 6 loads unchanged", () => {
  const v6 = JSON.parse(JSON.stringify(skirmishV6));
  expect(loadScenario(v6)).toEqual(loadScenario({ ...v6, formatVersion: FORMAT_VERSION }));
});

test("levels give experience to those nearby unless they credit the killer", () => {
  const scenario = fixture();
  scenario.definitions[0].levels = { thresholds: [10] };
  expect(issues(scenario)).toEqual(["Nearby credit needs a range"]);
  scenario.definitions[0].levels = { thresholds: [10], credit: "killer" };
  expect(issues(scenario)).toEqual([]);
});

test("a level-up names its entity, and granting experience names what it selects", () => {
  const scenario = fixture();
  scenario.triggers = [
    {
      id: "promotion",
      event: { type: "leveled", level: 2 },
      actions: [
        { type: "grantExperience", entity: "$triggering", amount: 5 },
        { type: "grantExperience", definitionIds: ["dragon"], amount: 5 },
      ],
    },
  ];
  expect(issues(scenario)).toEqual(['Unknown definition "dragon"']);
});

test("format 7 loads unchanged", () => {
  const v7 = JSON.parse(JSON.stringify(skirmishV7));
  expect(loadScenario(v7)).toEqual(loadScenario({ ...v7, formatVersion: FORMAT_VERSION }));
});

test("research and requirements name upgrades and definitions that exist", () => {
  const scenario = fixture();
  scenario.upgrades = [
    {
      id: "weapons",
      name: "Weapons",
      levels: 2,
      definitionIds: ["dragon"],
      modifiers: [{ stat: "damage", add: 1 }],
    },
  ];
  scenario.definitions[0].researches = ["weapons", "shields"];
  scenario.definitions[0].requires = [
    { type: "upgrade", upgrade: "weapons", level: 3 },
    { type: "owns", definitionIds: ["wyrm"] },
  ];
  expect(issues(scenario)).toEqual([
    'Unknown definition "dragon"',
    'Unknown upgrade "shields"',
    '"weapons" has only 2 levels',
    'Unknown definition "wyrm"',
  ]);
});

test("offers and merging name definitions", () => {
  const scenario = fixture();
  scenario.definitions[0].offers = { definitionIds: ["soldier", "dragon"], count: 3 };
  scenario.definitions[0].merge = { count: 3, into: "wyrm" };
  expect(issues(scenario)).toEqual(['Unknown definition "dragon"', 'Unknown definition "wyrm"']);
  scenario.definitions[0].merge = { count: 1, into: "soldier" };
  expect(issues(scenario)).toHaveLength(2);
});

test("validates selections, stopTimer, and command rules", () => {
  const scenario = withLogic();
  scenario.triggers.push({
    id: "round",
    event: { type: "timer", timer: "wave" },
    actions: [
      { type: "stopTimer", timer: "wave" },
      { type: "walk", playerId: "blue", path: "road" },
      { type: "modify", definitionIds: ["dragon"], stat: "damage", add: 2 },
      { type: "returnHome", entity: "$triggering" },
      { type: "setHome" },
      { type: "rollOffers", playerId: "green" },
    ],
  });
  scenario.commandRules = [
    {
      commands: ["produce"],
      conditions: [{ type: "count", playerId: "$triggering", op: ">", value: 0 }],
    },
    { conditions: [{ type: "variable", variable: "gold", op: "==", value: 0 }] },
  ];
  expect(issues(scenario).sort()).toEqual([
    "Only died, entered, and leveled events have a triggering entity",
    "Only died, entered, and leveled events have a triggering entity",
    'Unknown definition "dragon"',
    'Unknown path "road"',
    'Unknown player "green"',
    'Unknown variable "gold"',
  ]);
  scenario.commandRules = [{ commands: ["fly"], conditions: [] }];
  expect(issues(scenario).length).toBeGreaterThan(0);
});

test("bounty, ability cost, and near default off, and near names definitions", () => {
  const scenario = fixture();
  const buy = {
    id: "buy",
    name: "Buy",
    cooldown: 1,
    target: "self",
    effects: [{ type: "modify", stat: "damage", add: 2 }],
  };
  scenario.definitions[0].abilities = [buy];
  const loaded = loadScenario(scenario);
  expect(loaded.definitions[0].bounty).toBe(0);
  expect(loaded.definitions[0].abilities[0].cost).toBe(0);
  expect(loaded.definitions[0].abilities[0].near).toBeUndefined();

  scenario.definitions[0].abilities = [{ ...buy, near: { definitionIds: ["shop"], range: 3 } }];
  expect(issues(scenario)).toEqual(['Unknown definition "shop"']);
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
    "Only died, entered, and leveled events have a triggering entity",
    "Only died, entered, and leveled events have a triggering entity",
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
