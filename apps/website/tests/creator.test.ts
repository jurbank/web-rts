import { loadScenario } from "data";
import {
  addItem,
  applyEdit,
  blankDocument,
  createHistory,
  parseDocument,
  readVictory,
  serializeDocument,
  setItem,
  setVictory,
  undo,
  type Operation,
  type Victory,
} from "editor";
import { createWorld, step } from "sim";
import { expect, test } from "vite-plus/test";
import skirmish from "../src/scenarios/skirmish.json" with { type: "json" };
import { createLocalStorage } from "../src/storage.ts";

function memoryStorage() {
  const items = new Map<string, string>();
  return createLocalStorage({
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  });
}

test("storage lists, saves, and loads by name", async () => {
  const storage = memoryStorage();
  expect(await storage.list()).toEqual([]);
  expect(await storage.load("missing")).toBeNull();
  await storage.save("b", "two");
  await storage.save("a", "one");
  await storage.save("b", "three");
  expect(await storage.list()).toEqual(["a", "b"]);
  expect(await storage.load("b")).toBe("three");
});

test("build, save, reload, playtest, and return to editing with nothing lost", async () => {
  const storage = memoryStorage();
  const base = loadScenario(skirmish);
  const place = (index: number, definitionId: string, playerId: string | null, x: number) =>
    addItem("placements", index, { definitionId, playerId, x, y: 10 });

  let history = createHistory(blankDocument({ ...base, triggers: [] }, { width: 40, height: 20 }));
  const edits: Operation[] = [
    place(0, "hq", "red", 5),
    place(1, "soldier", "red", 10),
    place(2, "hq", "blue", 35),
    place(3, "rock", null, 20),
    setItem("players", 0, { ...base.players[0], start: { x: 5, y: 10 } }),
  ];
  for (const edit of edits) history = applyEdit(history, edit);
  const hq: Victory = { type: "destroyDefinitions", definitionIds: ["hq"] };
  history = applyEdit(history, setVictory(history.document, hq));

  await storage.save("mine", serializeDocument(history.document));
  const reloaded = parseDocument((await storage.load("mine"))!);
  expect(reloaded).toEqual(history.document);

  const before = serializeDocument(history.document);
  const world = createWorld(parseDocument(before), 1);
  step(world, [{ type: "attack", playerId: "red", tick: 0, unitIds: [2], x: 35, y: 10 }]);
  while (world.outcome === null && world.tick < 30 * 600) step(world);
  expect(world.outcome).toEqual({ winningTeam: "red" });

  expect(serializeDocument(history.document)).toBe(before);
  expect(readVictory(history.document)).toEqual(hq);
  expect(readVictory(undo(history).document)).toBeNull();
});
