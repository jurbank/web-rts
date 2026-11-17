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
import { entity, run } from "./helpers.ts";
import moba from "./fixtures/moba.json" with { type: "json" };

const LIMIT = 10 * 60 * TICK_RATE;
const RED_HERO = 1;
const BLUE_HERO = 2;

type Raw = Record<string, any>;

function mobaWorld(edit?: (raw: Raw) => void): World {
  const raw: Raw = JSON.parse(JSON.stringify(moba));
  edit?.(raw);
  return createWorld(loadScenario(raw), 1);
}

/** Two heroes out of each other's sight, with nothing else on the map and nobody deciding for blue. */
function duel(): World {
  return mobaWorld((raw) => {
    raw.players[1].controller = "human";
    raw.placements = [
      { definitionId: "hero", playerId: "red", x: 10, y: 12 },
      { definitionId: "hero", playerId: "blue", x: 20, y: 12 },
    ];
    raw.triggers = [];
  });
}

function cast(abilityId: string, targetId?: number): Command {
  return { type: "cast", playerId: "red", tick: 0, unitId: RED_HERO, abilityId, targetId };
}

/** Red's hero bolts the nearest enemy whenever it can, and otherwise attacks it. */
function push(world: World): Command[] {
  const hero = world.entities.find((candidate) => candidate.id === RED_HERO);
  if (hero === undefined) return [];
  let near: World["entities"][number] | undefined;
  for (const other of world.entities) {
    if (other.playerId !== "blue" && other.playerId !== "blueBase") continue;
    const closer =
      near === undefined ||
      Math.hypot(other.x - hero.x, other.y - hero.y) < Math.hypot(near.x - hero.x, near.y - hero.y);
    if (closer) near = other;
  }
  if (near === undefined) return [];
  const base = { playerId: "red", tick: world.tick };
  if (hero.abilityCooldowns[0] === 0 && Math.hypot(near.x - hero.x, near.y - hero.y) < 8) {
    return [{ ...base, type: "cast", unitId: RED_HERO, abilityId: "bolt", targetId: near.id }];
  }
  return hero.orders.length === 0
    ? [{ ...base, type: "attack", unitIds: [RED_HERO], targetId: near.id }]
    : [];
}

/** Nobody decides for blue, so its hero only defends itself. */
function passiveBlue(raw: Raw): void {
  raw.players[1].controller = "human";
}

function play(
  policy: (world: World) => Command[],
  options: { saveAt?: number; edit?: (raw: Raw) => void } = {},
): { world: World; events: SimEvent[] } {
  const { saveAt } = options;
  let world = mobaWorld(options.edit);
  const events: SimEvent[] = [];
  while (world.outcome === null && world.tick < LIMIT) {
    if (world.tick === saveAt) world = loadWorld(saveWorld(world));
    events.push(...step(world, world.tick % 15 === 0 ? policy(world) : []));
  }
  return { world, events };
}

test("the scenario survives a save and a load", () => {
  const scenario = loadScenario(moba);
  expect(loadScenario(JSON.parse(JSON.stringify(scenario)))).toEqual(scenario);
});

test("an idle player loses the ancient, and the whole team with it", () => {
  const { world } = play(() => []);
  expect(world.outcome).toEqual({ winningTeam: "east" });
  expect(world.players.map((player) => player.defeated)).toEqual([true, false, true, false]);
});

test("a hero that pushes with its creeps levels up and takes the enemy ancient", () => {
  const { world, events } = play(push, { edit: passiveBlue });
  expect(world.outcome).toEqual({ winningTeam: "west" });
  expect(world.players.map((player) => player.defeated)).toEqual([false, true, false, true]);
  expect(events).toContainEqual({ type: "leveled", id: RED_HERO, level: 2 });
});

test("two heroes that fight each other die, respawn, and level", () => {
  const { events } = play(push);
  for (const id of [RED_HERO, BLUE_HERO]) {
    expect(events).toContainEqual({ type: "respawned", id });
    expect(events).toContainEqual({ type: "leveled", id, level: 5 });
  }
});

test("a save and load partway through does not change the result", () => {
  const expected = hashWorld(play(push).world);
  for (const saveAt of [1, 30 * TICK_RATE + 7, 120 * TICK_RATE]) {
    expect(hashWorld(play(push, { saveAt }).world)).toBe(expected);
  }
});

test("teammates do not fight, and cannot be ordered to", () => {
  const world = mobaWorld();
  const ancient = world.entities.find((candidate) => candidate.playerId === "redBase")!;
  run(world, 30, [
    { type: "attack", playerId: "red", tick: 0, unitIds: [RED_HERO], targetId: ancient.id },
  ]);
  expect(entity(world, RED_HERO).orders).toEqual([]);
  expect(ancient.health).toBe(800);
});

test("creeps on a path fight what they meet and then walk on", () => {
  const world = mobaWorld(passiveBlue);
  const resumed = new Set<number>();
  const fought = new Set<number>();
  for (let tick = 0; tick < 60 * TICK_RATE; tick++) {
    step(world);
    for (const creep of world.entities) {
      if (creep.definitionId !== "creep") continue;
      const [current, beneath] = creep.orders;
      if (current?.type === "attack" && beneath?.type === "path") fought.add(creep.id);
      else if (current?.type === "path" && fought.has(creep.id)) resumed.add(creep.id);
    }
  }
  expect(fought.size).toBeGreaterThan(0);
  expect(resumed.size).toBeGreaterThan(0);
});

test("an ability is cast from range, then has to cool down", () => {
  const world = duel();
  run(world, 1, [cast("bolt", BLUE_HERO)]);
  expect(entity(world, RED_HERO).orders[0]).toMatchObject({ type: "cast" });
  while (entity(world, BLUE_HERO).health === 300) step(world);

  const hero = entity(world, RED_HERO);
  expect(entity(world, BLUE_HERO).health).toBe(230);
  expect(20 - hero.x).toBeCloseTo(6.6, 0);
  expect(hero.abilityCooldowns[0]).toBe(6 * TICK_RATE);
  expect(hero.orders[0]).toEqual({ type: "attack", targetId: BLUE_HERO });
  expect(takeSnapshot(world).entities[0].abilityCooldowns[0]).toBe(6);

  run(world, 1, [{ ...cast("bolt", BLUE_HERO), tick: world.tick }]);
  expect(hero.orders[0]).toEqual({ type: "attack", targetId: BLUE_HERO });
});

test("an ability needs its level, and its modifier wears off", () => {
  const world = duel();
  const hero = entity(world, RED_HERO);
  run(world, 1, [cast("sprint")]);
  expect(hero.modifiers).toEqual([]);

  hero.level = 2;
  run(world, 1, [
    { ...cast("sprint"), tick: world.tick },
    { type: "move", playerId: "red", tick: world.tick, unitIds: [RED_HERO], x: 10, y: 2 },
  ]);
  expect(hero.modifiers).toEqual([{ stat: "speed", add: 3, remaining: 4 * TICK_RATE - 1 }]);
  const start = hero.y;
  run(world, 15);
  expect(start - hero.y).toBeCloseTo(8 * 0.5);
  run(world, 4 * TICK_RATE);
  expect(hero.modifiers).toEqual([]);
});

test("a death nearby gives experience, and a level raises health and damage", () => {
  const world = duel();
  entity(world, BLUE_HERO).health = 0;
  expect(step(world)).toContainEqual({ type: "leveled", id: RED_HERO, level: 2 });
  expect(entity(world, RED_HERO)).toMatchObject({ level: 2, experience: 0, health: 360 });
  expect(takeSnapshot(world).entities[0]).toMatchObject({ level: 2, maxHealth: 360 });
});

test("a dead hero comes back at home with its id and level", () => {
  const world = duel();
  const blue = entity(world, BLUE_HERO);
  blue.level = 3;
  blue.health = 0;
  blue.x = 15;
  expect(step(world).map((event) => event.type)).toContain("died");
  expect(world.entities.map((candidate) => candidate.id)).toEqual([RED_HERO]);

  const events = run(world, 10 * TICK_RATE);
  expect(events).toContainEqual({ type: "respawned", id: BLUE_HERO });
  expect(world.entities.map((candidate) => candidate.id)).toEqual([RED_HERO, BLUE_HERO]);
  expect(entity(world, BLUE_HERO)).toMatchObject({ x: 20, y: 12, level: 3, health: 420 });
});

const SHOP_RANGE_X = 20;

/** Both heroes at home beside their shops, with no waves, no income, and nobody deciding for blue. */
function shopWorld(): World {
  return mobaWorld((raw) => {
    passiveBlue(raw);
    raw.triggers = raw.triggers.filter((trigger: Raw) => trigger.id.endsWith("Falls"));
  });
}

test("a purchase needs the money and the shop, and lasts through respawn", () => {
  const world = shopWorld();
  const hero = entity(world, RED_HERO);
  const red = world.players[0];
  run(world, 1, [cast("blade")]);
  expect(hero.modifiers).toEqual([]);

  red.resources = 200;
  run(world, 1, [{ ...cast("blade"), tick: world.tick }]);
  expect(hero.modifiers).toEqual([{ stat: "damage", add: 8, remaining: null }]);
  expect(red.resources).toBe(50);
  expect(takeSnapshot(world).entities[0].abilityUsable).toEqual([true, false, false, false]);

  red.resources = 200;
  hero.x = SHOP_RANGE_X;
  run(world, TICK_RATE, [{ ...cast("blade"), tick: world.tick }]);
  expect(hero.modifiers).toHaveLength(1);
  expect(red.resources).toBe(200);

  hero.health = 0;
  run(world, 10 * TICK_RATE + 1);
  expect(entity(world, RED_HERO)).toMatchObject({
    x: 8,
    modifiers: [{ stat: "damage", add: 8, remaining: null }],
  });
});

test("a cast that reaches its target without the money ends", () => {
  const world = mobaWorld((raw) => {
    raw.definitions[0].abilities[0].cost = 50;
    raw.players[1].controller = "human";
    raw.placements = [
      { definitionId: "hero", playerId: "red", x: 10, y: 12 },
      { definitionId: "hero", playerId: "blue", x: 20, y: 12 },
    ];
    raw.triggers = [];
  });
  world.players[0].resources = 50;
  run(world, 1, [cast("bolt", BLUE_HERO)]);
  expect(entity(world, RED_HERO).orders[0]).toMatchObject({ type: "cast" });
  world.players[0].resources = 0;
  run(world, 2 * TICK_RATE);
  expect(entity(world, RED_HERO).abilityCooldowns[0]).toBe(0);
  expect(entity(world, BLUE_HERO).health).toBeGreaterThan(230);
});

test("a death pays its bounty to the enemy who dealt the last damage", () => {
  const world = duel();
  entity(world, BLUE_HERO).health = 10;
  const events = run(world, 3 * TICK_RATE, [
    { type: "attack", playerId: "red", tick: 0, unitIds: [RED_HERO], targetId: BLUE_HERO },
  ]);
  expect(events).toContainEqual(expect.objectContaining({ type: "died", id: BLUE_HERO }));
  expect(world.players.map((player) => player.resources)).toEqual([100, 0, 0, 0]);

  const red = entity(world, RED_HERO);
  red.lastHit = { tick: world.tick, playerIds: ["redBase"] };
  red.health = 0;
  step(world);
  expect(world.players.map((player) => player.resources)).toEqual([100, 0, 0, 0]);
});

test("a kill two players land on one tick goes to either by a seeded draw, not by seat", () => {
  const winners = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const raw: Raw = JSON.parse(JSON.stringify(moba));
    raw.players[1].controller = "human";
    raw.players.push({ id: "green", color: "#30a46c", controller: "human", team: "south" });
    raw.placements = [
      { definitionId: "hero", playerId: "red", x: 17, y: 12 },
      // Just out of reach, so blue fires on arriving, after red's shot has killed.
      { definitionId: "hero", playerId: "blue", x: 24.5, y: 12 },
      { definitionId: "creep", playerId: "green", x: 20, y: 12 },
    ];
    raw.triggers = [];
    const world = createWorld(loadScenario(raw), seed);
    entity(world, 3).health = 10;
    const events = step(world, [
      { type: "attack", playerId: "red", tick: 0, unitIds: [RED_HERO], targetId: 3 },
      { type: "attack", playerId: "blue", tick: 0, unitIds: [BLUE_HERO], targetId: 3 },
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: "died", id: 3 }));
    expect(entity(world, RED_HERO).cooldown).toBeGreaterThan(0);
    expect(entity(world, BLUE_HERO).cooldown).toBeGreaterThan(0);
    const paid = world.players.filter((player) => player.resources === 15);
    expect(paid).toHaveLength(1);
    winners.add(paid[0].id);
  }
  expect([...winners].sort()).toEqual(["blue", "red"]);
});

test("the ai buys at its shop", () => {
  const world = mobaWorld();
  world.players[1].resources = 150;
  step(world);
  expect(entity(world, BLUE_HERO).modifiers).toEqual([{ stat: "damage", add: 8, remaining: null }]);
  expect(world.players[1].resources).toBe(0);
});
