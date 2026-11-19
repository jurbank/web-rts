import { expect, test } from "vite-plus/test";
import { TICK_RATE } from "../src/index.ts";
import { entity, ids, resources, run, skirmishWorld } from "./helpers.ts";

const [worker, second] = ids.redWorkers;
const barracksSite = { definitionId: "barracks", x: 18, y: 24 };

test("a gatherer carries resources from a node to a drop-off, again and again", () => {
  const world = skirmishWorld();
  run(world, 60 * TICK_RATE, [
    { type: "gather", playerId: "red", tick: 0, unitIds: [worker], nodeId: ids.redOre },
  ]);
  const delivered = resources(world, "red") - 200;
  expect(delivered).toBeGreaterThanOrEqual(30);
  expect(delivered % 10).toBe(0);
  expect(entity(world, ids.redOre).amount + delivered + entity(world, worker).carrying).toBe(1500);
});

test("a depleted node disappears and its gatherer moves to the next one", () => {
  const world = skirmishWorld({
    edit(raw) {
      raw.definitions[4].resource.amount = 20;
    },
  });
  const events = run(world, 60 * TICK_RATE, [
    { type: "gather", playerId: "red", tick: 0, unitIds: [worker], nodeId: ids.redOre },
  ]);
  expect(events).toContainEqual({
    type: "died",
    id: ids.redOre,
    definitionId: "ore",
    playerId: null,
    x: 8,
    y: 14,
  });
  expect(resources(world, "red")).toBeGreaterThan(220);
  const [order] = entity(world, worker).orders;
  expect(order?.type === "gather" && order.nodeId !== ids.redOre).toBe(true);
});

test("a builder pays for a building, constructs it over its build time, and it gains health", () => {
  const world = skirmishWorld();
  run(world, 1, [{ type: "build", playerId: "red", tick: 0, unitIds: [worker], ...barracksSite }]);
  expect(resources(world, "red")).toBe(50);
  const barracks = entity(world, ids.next);
  expect(barracks).toMatchObject({
    definitionId: "barracks",
    playerId: "red",
    buildRemaining: 300,
  });
  expect(barracks.health).toBeLessThan(5);

  const events = run(world, 11 * TICK_RATE);
  expect(barracks.buildRemaining).toBeGreaterThan(0);
  events.push(...run(world, 2 * TICK_RATE));
  expect(events).toContainEqual({ type: "completed", id: barracks.id });
  expect(barracks.health).toBeCloseTo(400, 6);
  expect(entity(world, worker).orders).toEqual([]);
});

test("two builders finish sooner than one", () => {
  const world = skirmishWorld();
  const events = run(world, 8 * TICK_RATE, [
    { type: "build", playerId: "red", tick: 0, unitIds: [worker, second], ...barracksSite },
  ]);
  expect(events).toContainEqual({ type: "completed", id: ids.next });
});

test("a building that cannot be afforded or does not fit is not started", () => {
  const world = skirmishWorld({
    edit(raw) {
      raw.players[0].resources = 500;
    },
  });
  const build = { type: "build" as const, playerId: "red", tick: 0, unitIds: [worker] };
  run(world, 1, [
    { ...build, definitionId: "barracks", x: 9, y: 25 },
    { ...build, definitionId: "barracks", x: 1, y: 1 },
    { ...build, definitionId: "hq", x: 18, y: 24 },
    { ...build, playerId: "blue", ...barracksSite },
  ]);
  expect(world.entities).toHaveLength(ids.next - 1);
  expect(resources(world, "red")).toBe(500);

  const poor = skirmishWorld({
    edit(raw) {
      raw.players[0].resources = 149;
    },
  });
  run(poor, 1, [{ ...build, ...barracksSite }]);
  expect(poor.entities).toHaveLength(ids.next - 1);
});

test("a building trains units for a price, one at a time", () => {
  const world = skirmishWorld();
  const produce = {
    type: "produce",
    playerId: "red",
    tick: 0,
    buildingId: ids.redHq,
    definitionId: "worker",
  } as const;
  const events = run(world, 4 * TICK_RATE - 1, [
    produce,
    produce,
    { ...produce, definitionId: "soldier" },
  ]);
  expect(resources(world, "red")).toBe(100);
  expect(entity(world, ids.redHq).queue).toHaveLength(2);
  expect(events).toEqual([]);

  events.push(...run(world, 2));
  expect(events).toEqual([{ type: "produced", id: ids.next, buildingId: ids.redHq }]);
  const trained = entity(world, ids.next);
  expect(trained).toMatchObject({ definitionId: "worker", playerId: "red", health: 40 });
  expect(Math.hypot(trained.x - 8, trained.y - 24)).toBeGreaterThan(3);

  events.push(...run(world, 4 * TICK_RATE));
  expect(events).toHaveLength(2);
});

test("production is refused without the resources, and while under construction", () => {
  const world = skirmishWorld({
    edit(raw) {
      raw.players[0].resources = 180;
    },
  });
  run(world, 2, [{ type: "build", playerId: "red", tick: 0, unitIds: [worker], ...barracksSite }]);
  const soldier = {
    type: "produce",
    playerId: "red",
    buildingId: ids.next,
    definitionId: "soldier",
  } as const;
  run(world, 1, [{ ...soldier, tick: 0 }]);
  expect(entity(world, ids.next).queue).toEqual([]);
  run(world, 14 * TICK_RATE);
  expect(entity(world, ids.next).buildRemaining).toBe(0);
  run(world, 1, [{ ...soldier, tick: 0 }]);
  expect(entity(world, ids.next).queue).toEqual([]);
  expect(resources(world, "red")).toBe(30);
});

test("a queue holds no more than its building's limit", () => {
  const world = skirmishWorld({
    edit(raw) {
      raw.players[0].resources = 1000;
      raw.definitions[2].queueLimit = 2;
    },
  });
  const produce = {
    type: "produce" as const,
    playerId: "red",
    tick: 0,
    buildingId: ids.redHq,
    definitionId: "worker",
  };
  run(world, 1, [produce, produce, produce]);
  expect(entity(world, ids.redHq).queue).toHaveLength(2);
  expect(resources(world, "red")).toBe(900);
});

test("definition ids that name object internals are ignored", () => {
  const world = skirmishWorld();
  const before = JSON.stringify(world.entities);
  for (const definitionId of ["constructor", "__proto__", "toString"]) {
    run(world, 1, [
      { type: "produce", playerId: "red", tick: world.tick, buildingId: ids.redHq, definitionId },
      {
        type: "build",
        playerId: "red",
        tick: world.tick,
        unitIds: [worker],
        definitionId,
        x: 18,
        y: 24,
      },
    ]);
  }
  expect(JSON.stringify(world.entities)).toBe(before);
  expect(resources(world, "red")).toBe(200);
});
