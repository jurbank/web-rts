import { loadScenario, type Scenario } from "data";
import { expect, test } from "vite-plus/test";
import {
  applyEdit,
  applyOperation,
  assignPlacements,
  blankDocument,
  createHistory,
  movePlacements,
  parseDocument,
  redo,
  removePlacements,
  serializeDocument,
  undo,
  type Operation,
} from "../src/index.ts";

function scenario(): Scenario {
  return loadScenario({
    formatVersion: 1,
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
    victory: { type: "destroyAll" },
  });
}

const rock = { definitionId: "rock", playerId: null, x: 4, y: 4 };

const operations: Record<string, (document: Scenario) => Operation> = {
  addPlacement: () => ({ type: "addPlacement", index: 1, placement: rock }),
  removePlacement: () => ({ type: "removePlacement", index: 0 }),
  setPlacement: () => ({ type: "setPlacement", index: 2, placement: rock }),
  setPlayer: (document) => ({
    type: "setPlayer",
    index: 0,
    player: { ...document.players[0], start: { x: 9, y: 9 } },
  }),
  setVictory: () => ({
    type: "setVictory",
    victory: { type: "destroyDefinitions", definitionIds: ["hq"] },
  }),
  removePlacements: () => removePlacements([0, 2]),
  movePlacements: (document) => movePlacements(document, [0, 1], 1.5, -2),
  assignPlacements: (document) => assignPlacements(document, [1, 2], "red"),
  batch: () => ({
    type: "batch",
    operations: [
      { type: "addPlacement", index: 3, placement: rock },
      { type: "removePlacement", index: 0 },
      { type: "setVictory", victory: { type: "destroyDefinitions", definitionIds: ["hq"] } },
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

test("an index outside the document throws", () => {
  expect(() => applyOperation(scenario(), { type: "removePlacement", index: 3 })).toThrow("range");
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

test("a blank document keeps the content and drops what was on the map", () => {
  const base = scenario();
  const blank = blankDocument(base, { width: 8, height: 8 });
  expect(blank.definitions).toEqual(base.definitions);
  expect(blank.placements).toEqual([]);
  expect(blank.players[0]).not.toHaveProperty("start");
  expect(parseDocument(serializeDocument(blank))).toEqual(blank);
});
