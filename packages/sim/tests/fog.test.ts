import { FORMAT_VERSION, loadScenario } from "data";
import { expect, test } from "vite-plus/test";
import {
  canPlace,
  createWorld,
  hashWorld,
  loadWorld,
  saveWorld,
  step,
  takeSnapshot,
  type Command,
  type World,
} from "../src/index.ts";

const scout = { id: "scout", name: "Scout", radius: 0.3, speed: 30, sight: 3, maxHealth: 100 };
const tower = { id: "tower", name: "Tower", radius: 0.5, maxHealth: 200, researches: ["optics"] };
const guard = {
  ...scout,
  id: "guard",
  sight: 0,
  weapon: { damage: 1, range: 8, cooldown: 1 },
  abilities: [
    {
      id: "zap",
      name: "Zap",
      cooldown: 1,
      target: "enemy",
      range: 8,
      effects: [{ type: "damage", amount: 5 }],
    },
  ],
};
const at = (definitionId: string, playerId: string, x: number) => ({
  definitionId,
  playerId,
  x,
  y: 5.5,
});
function match(overrides: Record<string, unknown> = {}): World {
  return createWorld(
    loadScenario({
      formatVersion: FORMAT_VERSION,
      fogOfWar: true,
      map: { width: 40, height: 12 },
      players: [
        ["red", "west"],
        ["ally", "west"],
        ["blue", "east"],
        ["gold", "south"],
      ].map(([id, team]) => ({ id, team, controller: "human", color: "#ffffff", resources: 70 })),
      definitions: [scout, tower, guard],
      upgrades: [
        {
          id: "optics",
          name: "Optics",
          researchTime: 1 / 30,
          definitionIds: ["scout"],
          modifiers: [{ stat: "sight", add: 6 }],
        },
      ],
      placements: [
        at("scout", "ally", 5.5),
        at("guard", "red", 10.5),
        at("tower", "blue", 15.5),
        at("scout", "gold", 35.5),
      ],
      ...overrides,
    }),
    1,
  );
}
function move(playerId: string, id: number, x: number, tick = 0): Command {
  return { type: "move", playerId, tick, unitIds: [id], x, y: 5.5 };
}
function advance(world: World, count: number, commands: Command[] = []): void {
  for (let i = 0; i < count; i++) step(world, i === 0 ? commands : []);
}
const see = (world: World, viewer: string, id: number) =>
  takeSnapshot(world, viewer).entities.some((e) => e.id === id);

test("allied scouting enables attacks, losing shared sight drops a target, and unexplored ids cannot be ordered", () => {
  const world = match();
  const attack: Command = { type: "attack", playerId: "red", tick: 0, unitIds: [2], targetId: 3 };
  const cast: Command = {
    type: "cast",
    playerId: "red",
    tick: 0,
    unitId: 2,
    abilityId: "zap",
    targetId: 3,
  };
  step(world, [attack, cast]);
  expect(world.entities[1].orders).toEqual([]);
  expect(world.entities[2].health).toBe(200);
  expect(see(world, "red", 3)).toBe(false);
  advance(world, 10, [move("ally", 1, 13.5)]);
  expect(see(world, "red", 3)).toBe(true);
  expect(see(world, "gold", 3)).toBe(false);
  expect(world.entities[2].health).toBe(199);
  advance(world, 10, [attack, move("ally", 1, 4.5)]);
  expect(world.entities[1].orders).toEqual([]);
  expect(see(world, "red", 3)).toBe(false);
  const red = takeSnapshot(world, "red");
  expect(red.fog!.buildings).toEqual([
    { id: 3, definitionId: "tower", playerId: "blue", x: 15.5, y: 5.5 },
  ]);
  expect(red.fog!.visible).not.toEqual(red.fog!.explored);
});

test("a fog viewer receives only public fields on visible non-owned entities and private events only for its seat", () => {
  const world = match({
    placements: [
      at("scout", "ally", 13.5),
      at("guard", "red", 10.5),
      at("tower", "blue", 15.5),
      at("scout", "gold", 35.5),
    ],
    variables: [{ id: "phase", value: 2 }],
    timers: [{ id: "clock", seconds: 4 }],
  });
  const events = step(world, [
    { type: "research", playerId: "blue", buildingId: 3, upgradeId: "optics", tick: 0 },
  ]);
  const before = saveWorld(world);
  const red = takeSnapshot(world, "red", events);
  expect(red.entities.map((e) => e.id)).toEqual([1, 2, 3]);
  const publicKeys = [
    "id",
    "definitionId",
    "playerId",
    "x",
    "y",
    "health",
    "maxHealth",
    "level",
    "built",
    "amount",
  ].sort();
  for (const entity of [red.entities[0], red.entities[2]])
    expect(Object.keys(entity).sort()).toEqual(publicKeys);
  expect(red.entities[1]).toHaveProperty("abilityUsable");
  expect(red.players[2]).toEqual({ id: "blue", team: "east", defeated: false });
  expect(red.events.map((event) => event.type)).toEqual(["fired"]);
  expect(red.variables).toEqual({ phase: 2 });
  expect(red.timers).toEqual({ clock: null });
  expect(takeSnapshot(world, "blue", events).events).toEqual([
    { type: "researched", playerId: "blue", upgradeId: "optics", level: 1 },
    { type: "fired", to: { id: 3, playerId: "blue", x: 15.5, y: 5.5 } },
  ]);
  expect(takeSnapshot(world, null, events).entities).toHaveLength(4);
  expect(() => takeSnapshot(world, "missing")).toThrow("viewer");
  expect(saveWorld(world)).toBe(before);
});

test("a shot shows each viewer only the ends it sees", () => {
  const world = match({
    placements: [
      at("scout", "ally", 13.5),
      at("guard", "red", 10.5),
      { definitionId: "tower", playerId: "blue", x: 15.5, y: 7 },
      { definitionId: "scout", playerId: "gold", x: 10.5, y: 8 },
    ],
  });
  const events = step(world, [
    { type: "attack", playerId: "red", tick: 0, unitIds: [2], targetId: 3 },
  ]);
  const from = { id: 2, definitionId: "guard", playerId: "red", x: 10.5, y: 5.5 };
  const to = { id: 3, playerId: "blue", x: 15.5, y: 7 };
  expect(events).toEqual([{ type: "fired", from, to }]);
  expect(takeSnapshot(world, null, events).events).toEqual([{ type: "fired", from, to }]);
  expect(takeSnapshot(world, "red", events).events).toEqual([{ type: "fired", from, to }]);
  expect(takeSnapshot(world, "ally", events).events).toEqual([{ type: "fired", from, to }]);
  expect(takeSnapshot(world, "blue", events).events).toEqual([{ type: "fired", to }]);
  // Rounded to 1/16 of a turn: one step, not the exact bearing of the hidden tower.
  const turn = (2 * Math.PI) / 16;
  expect(takeSnapshot(world, "gold", events).events).toEqual([
    {
      type: "fired",
      from,
      direction: {
        x: expect.closeTo(Math.cos(turn), 9),
        y: expect.closeTo(Math.sin(turn), 9),
      },
    },
  ]);
});

test("shots from hidden attackers come last, by target, not by attacker", () => {
  const world = match({
    placements: [
      at("guard", "red", 4.5),
      at("guard", "red", 6.5),
      at("tower", "blue", 10.5),
      at("tower", "blue", 8.5),
      { definitionId: "scout", playerId: "ally", x: 9.5, y: 5.5 },
      { definitionId: "scout", playerId: "blue", x: 30.5, y: 5.5 },
    ],
  });
  const events = step(world, [
    { type: "attack", playerId: "red", tick: 0, unitIds: [1], targetId: 4 },
    { type: "attack", playerId: "red", tick: 0, unitIds: [2], targetId: 3 },
  ]);
  expect(events.map((event) => event.type === "fired" && event.to!.id)).toEqual([4, 3]);
  expect(
    takeSnapshot(world, "blue", events).events.map(
      (event) => event.type === "fired" && [event.from?.id, event.to!.id],
    ),
  ).toEqual([
    [undefined, 3],
    [undefined, 4],
  ]);
});

test("a death shows to its team and to viewers who see where it fell, and a remembered building falls silently", () => {
  const world = match({
    placements: [
      at("scout", "ally", 13.5),
      at("guard", "red", 10.5),
      at("tower", "blue", 15.5),
      at("scout", "gold", 35.5),
    ],
    definitions: [scout, tower, { ...guard, weapon: undefined }],
  });
  step(world);
  world.entities[1].health = 0;
  let events = step(world);
  const guardDied = {
    type: "died",
    id: 2,
    definitionId: "guard",
    playerId: "red",
    x: 10.5,
    y: 5.5,
  };
  expect(takeSnapshot(world, "ally", events).events).toEqual([guardDied]);
  expect(takeSnapshot(world, "blue", events).events).toEqual([]);

  world.entities[1].health = 0;
  events = step(world);
  const towerDied = {
    type: "died",
    id: 3,
    definitionId: "tower",
    playerId: "blue",
    x: 15.5,
    y: 5.5,
  };
  expect(takeSnapshot(world, "red", events).events).toEqual([towerDied]);
  expect(takeSnapshot(world, "blue", events).events).toEqual([towerDied]);
  expect(takeSnapshot(world, "gold", events).events).toEqual([]);

  const unseen = match({ definitions: [scout, tower, { ...guard, weapon: undefined }] });
  advance(unseen, 10, [move("ally", 1, 13.5)]);
  advance(unseen, 10, [move("ally", 1, 4.5)]);
  expect(takeSnapshot(unseen, "red").fog!.buildings.map(({ id }) => id)).toEqual([3]);
  unseen.entities[2].health = 0;
  events = step(unseen);
  expect(events.map((event) => event.type)).toEqual(["died"]);
  expect(takeSnapshot(unseen, "red", events).events).toEqual([]);
});

test("a region reveal affects subsequent trigger conditions, survives reload, and leaves a last sighting after expiry", () => {
  const world = match({
    regions: [{ id: "site", x: 15, y: 5, width: 1, height: 1 }],
    variables: [{ id: "spotted", value: 0 }],
    triggers: [
      {
        id: "scan",
        event: { type: "start" },
        actions: [{ type: "reveal", playerId: "red", region: "site", seconds: 2 / 30 }],
      },
      {
        id: "observe",
        event: { type: "tick" },
        conditions: [
          { type: "visible", viewer: "ally", playerId: "blue", definitionIds: ["tower"] },
        ],
        actions: [{ type: "addVariable", variable: "spotted", value: 1 }],
      },
    ],
  });
  step(world);
  expect(world.variables.spotted).toBe(1);
  expect(see(world, "ally", 3)).toBe(true);
  expect(see(world, "gold", 3)).toBe(false);
  const restored = loadWorld(saveWorld(world));
  for (const copy of [world, restored]) {
    step(copy);
    expect(copy.variables.spotted).toBe(2);
    step(copy);
    expect(copy.variables.spotted).toBe(2);
    expect(see(copy, "red", 3)).toBe(false);
    expect(takeSnapshot(copy, "ally").fog!.buildings[0].id).toBe(3);
    copy.entities[2].health = 0;
    step(copy);
    expect(takeSnapshot(copy, "red").fog!.buildings).toHaveLength(1);
    advance(copy, 10, [move("ally", 1, 14.5)]);
    expect(takeSnapshot(copy, "red").fog!.buildings).toEqual([]);
  }
  expect(hashWorld(world)).toBe(hashWorld(restored));
});

test("restoring before an allied scout crosses a sight boundary preserves the tick's decisions", () => {
  const world = match({
    placements: [
      at("scout", "ally", 11.5),
      at("guard", "red", 10.5),
      at("tower", "blue", 15.5),
      at("scout", "gold", 35.5),
    ],
  });
  const restored = loadWorld(saveWorld(world));
  const commands = [move("ally", 1, 13.5), move("gold", 4, 33.5)];
  step(world, commands);
  step(restored, commands.toReversed());
  expect(world.entities[2].health).toBe(200);
  expect(hashWorld(restored)).toBe(hashWorld(world));
  step(world);
  step(restored);
  expect(world.entities[2].health).toBe(199);
  expect(hashWorld(restored)).toBe(hashWorld(world));
});

test("research expands the team's sight independently of weapon range", () => {
  const world = match({
    placements: [at("tower", "ally", 2.5), at("scout", "ally", 7.5), at("tower", "blue", 15.5)],
  });
  expect(see(world, "red", 3)).toBe(false);
  step(world, [
    { type: "research", playerId: "ally", tick: 0, buildingId: 1, upgradeId: "optics" },
  ]);
  expect(see(world, "red", 3)).toBe(true);
});

test("with fog disabled a player view has the full battlefield", () => {
  const world = match({ fogOfWar: false });
  expect(takeSnapshot(world, "red")).toEqual(takeSnapshot(world, null));
  expect(world.fog).toBeUndefined();
});

test("a build preview and command reveal nothing about an unseen blocker at the edge of sight", () => {
  const command: Command = {
    type: "build",
    playerId: "red",
    tick: 0,
    unitIds: [1],
    definitionId: "tower",
    x: 12.5,
    y: 5.5,
  };
  const simulate = (blocked: boolean) => {
    const world = match({
      definitions: [
        { ...scout, builds: ["tower"] },
        { ...tower, cost: 10 },
      ],
      placements: [at("scout", "red", 10.5), ...(blocked ? [at("tower", "blue", 14.5)] : [])],
    });
    expect(see(world, "red", 2)).toBe(false);
    expect(canPlace(world, world.definitions.tower, 12.5, 5.5, "red")).toBe(false);
    step(world, [command]);
    expect(world.players[0].resources).toBe(70);
    return takeSnapshot(world, "red");
  };
  expect(simulate(true)).toEqual(simulate(false));
});

test("the owner receives production and merge events even if the result merges again this tick", () => {
  const world = match({
    definitions: [
      { ...tower, produces: ["scout"] },
      { ...scout, buildTime: 1 / 30, merge: { count: 2, into: "guard" } },
      { ...guard, merge: { count: 2, into: "veteran" } },
      { ...guard, id: "veteran" },
    ],
    placements: [at("tower", "red", 7.5), at("scout", "red", 9.5), at("guard", "red", 10.5)],
  });
  const events = step(world, [
    { type: "produce", playerId: "red", tick: 0, buildingId: 1, definitionId: "scout" },
  ]);
  expect(takeSnapshot(world, "red", events).events.map((event) => event.type)).toEqual([
    "produced",
    "merged",
    "merged",
  ]);
  expect(takeSnapshot(world, "ally", events).events).toEqual([]);
  expect(world.entities.map((entity) => entity.definitionId)).toEqual(["tower", "veteran"]);
});
