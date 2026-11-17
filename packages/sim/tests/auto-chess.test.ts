import { loadScenario } from "data";
import { expect, test } from "vite-plus/test";
import {
  createWorld,
  hashWorld,
  loadWorld,
  saveWorld,
  step,
  takeSnapshot,
  TICK_RATE,
  type Command,
  type SimEvent,
  type World,
} from "../src/index.ts";
import { resources, run } from "./helpers.ts";
import autoChess from "./fixtures/auto-chess.json" with { type: "json" };

const LIMIT = 10 * 60 * TICK_RATE;
const RED_SHOP = 1;
const BLUE_SHOP = 2;

type Raw = Record<string, any>;

function chessWorld(edit?: (raw: Raw) => void): World {
  const raw: Raw = JSON.parse(JSON.stringify(autoChess));
  edit?.(raw);
  return createWorld(loadScenario(raw), 1);
}

/** Nobody decides for blue, and every offer is a knight, so purchases are known. */
function knightsOnly(raw: Raw): void {
  raw.players[1].controller = "human";
  delete raw.players[1].ai;
  raw.definitions[0].offers.definitionIds = ["knight"];
}

function buy(world: World, definitionId: string, buildingId = RED_SHOP): Command {
  const playerId = buildingId === RED_SHOP ? "red" : "blue";
  return { type: "produce", playerId, tick: world.tick, buildingId, definitionId };
}

function shop(world: World, id = RED_SHOP) {
  return world.entities.find((entity) => entity.id === id)!;
}

/** Red buys the first offer it can afford whenever its shop is free. */
function buyer(world: World): Command[] {
  const red = shop(world);
  if (red.queue.length > 0) return [];
  const money = resources(world, "red");
  const offer = red.offers.find((id) => id !== null && world.definitions[id].cost <= money);
  return offer === undefined || offer === null ? [] : [buy(world, offer)];
}

function play(
  policy: (world: World) => Command[],
  options: { saveAt?: number; edit?: (raw: Raw) => void } = {},
): { world: World; events: SimEvent[] } {
  let world = chessWorld(options.edit);
  const events: SimEvent[] = [];
  while (world.outcome === null && world.tick < LIMIT) {
    if (world.tick === options.saveAt) world = loadWorld(saveWorld(world));
    events.push(...step(world, policy(world)));
  }
  return { world, events };
}

const PLANNING = 20 * TICK_RATE;

test("a player who buys nothing forfeits each round when combat starts", () => {
  const { world, events } = play(() => []);
  expect(world.outcome).toEqual({ winningTeam: "blue" });
  expect(world.variables).toMatchObject({ round: 3, redLives: 0, blueLives: 3 });
  expect(events.some((event) => event.type === "died")).toBe(false);
  expect(world.tick).toBe(3 * PLANNING + 1);
});

test("a player who keeps buying beats the ai, merging units on the way", () => {
  const { world, events } = play(buyer);
  expect(world.outcome).toEqual({ winningTeam: "red" });
  expect(world.variables).toMatchObject({ redLives: 3, blueLives: 0 });
  expect(events.some((event) => event.type === "died")).toBe(true);
  expect(events.filter((event) => event.type === "merged").length).toBeGreaterThan(0);
});

test("a save and load partway through does not change the result", () => {
  const expected = hashWorld(play(buyer).world);
  for (const saveAt of [1, PLANNING + 7, 50 * TICK_RATE]) {
    expect(hashWorld(play(buyer, { saveAt }).world)).toBe(expected);
  }
});

test("each shop starts with offers drawn from its pool", () => {
  const world = chessWorld();
  step(world);
  for (const id of [RED_SHOP, BLUE_SHOP]) {
    expect(shop(world, id).offers).toHaveLength(3);
    for (const offer of shop(world, id).offers) {
      expect(["knight", "archer", "brute"]).toContain(offer);
    }
  }
  expect(takeSnapshot(world).entities[0].offers).toEqual(shop(world).offers);
});

test("buying pays the cost and empties the first slot holding the offer", () => {
  const world = chessWorld(knightsOnly);
  step(world);
  run(world, 1, [buy(world, "knight"), buy(world, "archer")]);
  expect(shop(world).offers).toEqual([null, "knight", "knight"]);
  expect(resources(world, "red")).toBe(7);
  run(world, TICK_RATE);
  expect(world.entities.filter((entity) => entity.definitionId === "knight")).toHaveLength(1);
});

test("three knights become one knight II where the first stood", () => {
  const world = chessWorld(knightsOnly);
  step(world);
  const knights = () => world.entities.filter((entity) => entity.playerId === "red").slice(1);
  run(world, TICK_RATE, [buy(world, "knight")]);
  run(world, TICK_RATE, [buy(world, "knight")]);
  const first = { ...knights()[0] };
  const events = run(world, TICK_RATE, [buy(world, "knight")]);
  expect(knights().map((entity) => entity.definitionId)).toEqual(["knight2"]);
  expect(knights()[0]).toMatchObject({ x: first.x, y: first.y });
  expect(events.filter((event) => event.type === "merged")).toEqual([
    { type: "merged", id: knights()[0].id, from: [first.id, first.id + 1, first.id + 2] },
  ]);
  expect(events.some((event) => event.type === "died")).toBe(false);
});

test("a reroll is a costed ability on the shop that draws new offers", () => {
  const world = chessWorld();
  step(world);
  const before = world.rngState;
  run(world, 1, [
    { type: "cast", playerId: "red", tick: 1, unitId: RED_SHOP, abilityId: "reroll" },
  ]);
  expect(resources(world, "red")).toBe(8);
  expect(world.rngState).not.toBe(before);
  expect(shop(world).offers).toHaveLength(3);
});

test("commands are refused during combat and allowed again in planning", () => {
  const world = chessWorld(knightsOnly);
  step(world);
  expect(takeSnapshot(world).refusedCommands).toEqual([]);
  run(world, PLANNING, [buy(world, "knight"), buy(world, "knight", BLUE_SHOP)]);
  expect(world.variables.phase).toBe(1);
  expect(takeSnapshot(world).refusedCommands).toEqual([
    "move",
    "attack",
    "patrol",
    "hold",
    "stop",
    "gather",
    "build",
    "assist",
    "produce",
    "cast",
  ]);
  run(world, 1, [buy(world, "knight")]);
  expect(resources(world, "red")).toBe(7);
  while (world.variables.phase === 1) step(world);
  expect(world.variables.round).toBe(2);
  expect(resources(world, "red")).toBe(17);
  run(world, 1, [buy(world, "knight")]);
  expect(resources(world, "red")).toBe(14);
});

test("a unit walked into the middle during planning is sent home", () => {
  const world = chessWorld(knightsOnly);
  step(world);
  run(world, TICK_RATE, [buy(world, "knight")]);
  const knight = world.entities.find((entity) => entity.definitionId === "knight")!;
  const home = { ...knight.home };
  const move: Command = {
    type: "move",
    playerId: "red",
    tick: world.tick,
    unitIds: [knight.id],
    x: 20,
    y: 10,
  };
  run(world, 5 * TICK_RATE, [move]);
  expect(knight).toMatchObject({ x: home.x, y: home.y, orders: [] });
});

test("after combat both boards come back where they stood, at full health", () => {
  const world = chessWorld(knightsOnly);
  step(world);
  run(world, TICK_RATE, [buy(world, "knight")]);
  run(world, TICK_RATE, [buy(world, "knight"), buy(world, "knight", BLUE_SHOP)]);
  run(world, TICK_RATE);
  const board = () => world.entities.filter((entity) => entity.definitionId === "knight");
  const placed = board().map(({ id, x, y }) => ({ id, x, y, health: 120, modifiers: [] }));
  expect(placed).toHaveLength(3);

  const events = run(world, PLANNING - 3 * TICK_RATE);
  expect(world.variables.phase).toBe(1);
  // Two red knights make a bond, one blue knight does not.
  expect(board().map((entity) => entity.modifiers.length)).toEqual([1, 1, 0]);
  while (world.variables.phase === 1) events.push(...step(world));

  expect(events.some((event) => event.type === "died")).toBe(true);
  expect(events.some((event) => event.type === "respawned")).toBe(true);
  expect(world.variables).toMatchObject({ redLives: 3, blueLives: 2, round: 2 });
  expect(board()).toMatchObject(placed);
  expect(world.respawns).toEqual([]);
});

test("the fixture loads, saves, and loads again to the same scenario", () => {
  const first = loadScenario(autoChess);
  expect(loadScenario(JSON.parse(JSON.stringify(first)))).toEqual(first);
});

test("a purchase that names a slot is refused once that slot no longer holds it", () => {
  const world = chessWorld(knightsOnly);
  step(world);
  const inSlot = (slot: number, definitionId = "knight"): Command => ({
    type: "produce",
    playerId: "red",
    tick: world.tick,
    buildingId: RED_SHOP,
    definitionId,
    slot,
  });
  // A repeated tap on the same slot buys once.
  run(world, 1, [inSlot(0), inSlot(0), inSlot(1, "archer"), inSlot(7)]);
  expect(shop(world).offers).toEqual([null, "knight", "knight"]);
  expect(resources(world, "red")).toBe(7);
});

test("three seats buying on the same ticks each merge their own knights", () => {
  const world = chessWorld((raw) => {
    knightsOnly(raw);
    raw.players.push({ id: "green", color: "#30a46c", controller: "human" });
    raw.placements.push({ definitionId: "shop", playerId: "green", x: 18, y: 2 });
    raw.triggers[0].actions.push({ type: "grantResources", playerId: "green", amount: 10 });
  });
  step(world);
  const GREEN_SHOP = 3;
  const everyone = (): Command[] =>
    [RED_SHOP, BLUE_SHOP, GREEN_SHOP].map((buildingId, seat) => ({
      ...buy(world, "knight", buildingId),
      playerId: ["red", "blue", "green"][seat],
    }));
  for (let i = 0; i < 3; i++) run(world, TICK_RATE, everyone());
  for (const playerId of ["red", "blue", "green"]) {
    const units = world.entities.filter(
      (entity) => entity.playerId === playerId && entity.definitionId !== "shop",
    );
    expect(
      units.map((entity) => entity.definitionId),
      playerId,
    ).toEqual(["knight2"]);
  }
});
