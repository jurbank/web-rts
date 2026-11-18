import { loadScenario, type Scenario } from "data";
import { expect, test } from "vite-plus/test";
import {
  addItem,
  applyEdit,
  applyOperation,
  assignPlacements,
  blankDocument,
  createHistory,
  documentIssues,
  freshId,
  moveGuide,
  movePlacements,
  parseDocument,
  redo,
  readVictory,
  removeItem,
  removePlacements,
  renameGuide,
  serializeDocument,
  setItem,
  setVictory,
  undo,
  victoryTrigger,
  type Operation,
  type Victory,
} from "../src/index.ts";

function scenario(): Scenario {
  return loadScenario({
    formatVersion: 2,
    map: { width: 20, height: 10 },
    players: [
      { id: "red", color: "#ff0000", controller: "human", start: { x: 2, y: 2 } },
      { id: "blue", color: "#0000ff", controller: "ai", ai: { workers: 1, attackSize: 1 } },
    ],
    definitions: [
      { id: "hq", name: "Headquarters", radius: 2, maxHealth: 100 },
      { id: "rock", name: "Rock", radius: 1 },
    ],
    placements: [
      { definitionId: "hq", playerId: "red", x: 3, y: 5 },
      { definitionId: "hq", playerId: "blue", x: 17, y: 5 },
      { definitionId: "rock", x: 10, y: 5 },
    ],
    waypoints: [{ id: "gate", x: 1, y: 1 }],
    triggers: [
      victoryTrigger({ type: "destroyAll" }),
      {
        id: "reinforce",
        event: { type: "start" },
        actions: [{ type: "spawn", definitionId: "hq", playerId: "red", at: "gate" }],
      },
    ],
  });
}

const rock = { definitionId: "rock", playerId: null, x: 4, y: 4 };

const operations: Record<string, (document: Scenario) => Operation> = {
  addPlacement: () => addItem("placements", 1, rock),
  removePlacement: () => removeItem("placements", 0),
  setPlacement: () => setItem("placements", 2, rock),
  setPlayer: (document) => setItem("players", 0, { ...document.players[0], start: { x: 9, y: 9 } }),
  addDefinition: (document) =>
    addItem("definitions", 2, { ...document.definitions[1], id: "tree" }),
  setDefinition: (document) =>
    setItem("definitions", 0, { ...document.definitions[0], maxHealth: 250 }),
  addRegion: () => addItem("regions", 0, { id: "goal", x: 1, y: 1, width: 2, height: 2 }),
  addPath: () => addItem("paths", 0, { id: "lane", waypoints: ["gate"] }),
  moveGuide: (document) => moveGuide(document, "waypoints", 0, 3, 2),
  renameGuide: (document) => renameGuide(document, "waypoints", 0, "door"),
  setVictory: (document) =>
    setVictory(document, { type: "destroyDefinitions", definitionIds: ["hq"] }),
  removeVictory: (document) => setVictory(document, null),
  addTrigger: (document) => addItem("triggers", 0, { ...document.triggers[1], id: "again" }),
  removePlacements: () => removePlacements([0, 2]),
  movePlacements: (document) => movePlacements(document, [0, 1], 1.5, -2),
  assignPlacements: (document) => assignPlacements(document, [1, 2], "red"),
  batch: (document) => ({
    type: "batch",
    operations: [
      addItem("placements", 3, rock),
      removeItem("placements", 0),
      setVictory(document, { type: "destroyDefinitions", definitionIds: ["hq"] }),
    ],
  }),
};

test.for(Object.keys(operations))("%s then its inverse restores the document", (name) => {
  const before = scenario();
  const applied = applyOperation(before, operations[name](before));
  expect(applied.document).not.toEqual(before);
  expect(before).toEqual(scenario());
  expect(applyOperation(applied.document, applied.inverse).document).toEqual(before);
});

test("operations change what they say", () => {
  const before = scenario();
  const apply = (operation: Operation) => applyOperation(before, operation).document;

  expect(apply(removePlacements([0, 2])).placements).toEqual([before.placements[1]]);
  expect(apply(assignPlacements(before, [2], "blue")).placements[2].playerId).toBe("blue");
  expect(apply(movePlacements(before, [1], 9, -9)).placements[1]).toMatchObject({ x: 20, y: 0 });
});

test("undo restores the scenario fog setting", () => {
  const before = createHistory(scenario());
  const after = applyEdit(before, { type: "setFogOfWar", enabled: true });
  expect(parseDocument(serializeDocument(after.document)).fogOfWar).toBe(true);
  expect(undo(after).document).toEqual(before.document);
});

test("an index outside the document throws", () => {
  expect(() => applyOperation(scenario(), removeItem("placements", 3))).toThrow("range");
});

test("undo and redo walk the history", () => {
  const start = createHistory(scenario());
  const first = applyEdit(start, operations.addPlacement(start.document));
  const second = applyEdit(first, operations.movePlacements(first.document));

  expect(undo(start)).toBe(start);
  expect(redo(second)).toBe(second);
  expect(undo(second).document).toEqual(first.document);
  expect(undo(undo(second)).document).toEqual(start.document);
  expect(redo(redo(undo(undo(second)))).document).toEqual(second.document);
});

test("a new edit drops what was undone", () => {
  const start = createHistory(scenario());
  const undone = undo(applyEdit(start, operations.addPlacement(start.document)));
  const edited = applyEdit(undone, operations.setVictory(undone.document));
  expect(redo(edited)).toBe(edited);
  expect(undo(edited).document).toEqual(start.document);
});

test("an edited document survives a save and a load", () => {
  let history = createHistory(scenario());
  for (const name of ["addPlacement", "setPlayer", "setVictory", "movePlacements"]) {
    history = applyEdit(history, operations[name](history.document));
  }
  expect(parseDocument(serializeDocument(history.document))).toEqual(history.document);
});

test("loading rejects a document that is not a valid scenario", () => {
  const document = applyOperation(scenario(), assignPlacements(scenario(), [0], "green")).document;
  expect(() => parseDocument(serializeDocument(document))).toThrow("green");
});

test("the victory control reads and writes the victory trigger", () => {
  const base = scenario();
  const hq: Victory = { type: "destroyDefinitions", definitionIds: ["hq"] };
  const apply = (operation: Operation) => applyOperation(base, operation).document;

  expect(readVictory(base)).toEqual({ type: "destroyAll" });
  expect(readVictory(apply(setVictory(base, hq)))).toEqual(hq);
  expect(readVictory(apply(setVictory(base, null)))).toBeNull();
  expect(apply(setVictory(base, null)).triggers.map(({ id }) => id)).toEqual(["reinforce"]);

  const custom = apply(setItem("triggers", 0, { ...base.triggers[1], id: "victory" }));
  expect(readVictory(custom)).toBe("custom");
  const removed = apply(setVictory(base, null));
  const added = applyOperation(removed, setVictory(removed, hq)).document;
  expect(added.triggers.map(({ id }) => id)).toEqual(["reinforce", "victory"]);
});

test("a blank document keeps the content and drops what was on the map", () => {
  const base = scenario();
  const blank = blankDocument(base, { width: 8, height: 8 });
  expect(blank.definitions).toEqual(base.definitions);
  expect(blank.placements).toEqual([]);
  expect(blank.waypoints).toEqual([]);
  expect(blank.triggers).toEqual([base.triggers[0]]);
  expect(blank.players[0]).not.toHaveProperty("start");
  expect(parseDocument(serializeDocument(blank))).toEqual(blank);
});

test("guides stay inside the map when moved", () => {
  const base = scenario();
  const region = { id: "goal", x: 1, y: 1, width: 4, height: 2 };
  const withRegion = applyOperation(base, addItem("regions", 0, region)).document;
  const apply = (operation: Operation) => applyOperation(withRegion, operation).document;

  expect(apply(moveGuide(withRegion, "waypoints", 0, 99, -99)).waypoints[0]).toMatchObject({
    x: 20,
    y: 0,
  });
  expect(apply(moveGuide(withRegion, "regions", 0, 99, 99)).regions[0]).toMatchObject({
    x: 16,
    y: 8,
  });
});

test("renaming a guide updates the paths and triggers that name it", () => {
  let document = scenario();
  const edit = (operation: Operation) => {
    document = applyOperation(document, operation).document;
  };
  edit(addItem("paths", 0, { id: "lane", waypoints: ["gate"] }));
  edit(addItem("regions", 0, { id: "goal", x: 1, y: 1, width: 2, height: 2 }));
  edit(
    addItem("triggers", 2, {
      id: "arrive",
      event: { type: "entered", region: "goal" },
      conditions: [],
      actions: [
        { type: "spawn", definitionId: "hq", playerId: "red", at: "gate", count: 1, path: "lane" },
        { type: "walk", playerId: "red", path: "lane" },
        { type: "reveal", playerId: "red", region: "goal", seconds: 2 },
      ],
    }),
  );

  edit(renameGuide(document, "waypoints", 0, "door"));
  edit(renameGuide(document, "paths", 0, "road"));
  edit(renameGuide(document, "regions", 0, "end"));

  expect(documentIssues(document)).toEqual([]);
  expect(document.paths[0]).toEqual({ id: "road", waypoints: ["door"] });
  expect(document.triggers[1].actions[0]).toMatchObject({ at: "door" });
  expect(document.triggers[2]).toMatchObject({
    event: { region: "end" },
    actions: [{ at: "door", path: "road" }, { path: "road" }, { region: "end" }],
  });
});

test("an edit that breaks a reference is reported", () => {
  const base = scenario();
  const apply = (operation: Operation) => applyOperation(base, operation).document;

  expect(documentIssues(base)).toEqual([]);
  expect(documentIssues(apply(removeItem("waypoints", 0)))).toEqual([
    'triggers.1.actions.0.at: Unknown waypoint "gate"',
  ]);
  expect(documentIssues(apply(removeItem("definitions", 1)))).toEqual([
    'placements.2.definitionId: Unknown definition "rock"',
  ]);
});

test("a fresh id skips the ones in use", () => {
  expect(freshId([], "waypoint")).toBe("waypoint1");
  expect(freshId([{ id: "waypoint1" }, { id: "waypoint3" }], "waypoint")).toBe("waypoint2");
});
