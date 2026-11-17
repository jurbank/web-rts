import { expect, test } from "vite-plus/test";
import {
  MAX_COMMANDS_PER_TICK,
  MAX_ORDERS,
  step,
  TICK_RATE,
  type Command,
  type World,
} from "../src/index.ts";
import { entity, ids, run, skirmishWorld } from "./helpers.ts";

const soldier = ids.next;
const enemy = ids.next + 1;

/** A red soldier at (20, 40) and, given a spot, a blue worker there. */
function field(enemyAt?: { x: number; y: number }): World {
  return skirmishWorld({
    edit(raw) {
      raw.placements.push({ definitionId: "soldier", playerId: "red", x: 20, y: 40 });
      if (enemyAt !== undefined) {
        raw.placements.push({ definitionId: "worker", playerId: "blue", ...enemyAt });
      }
    },
  });
}

const order = (fields: Record<string, unknown>): Command =>
  ({ playerId: "red", tick: 0, unitIds: [soldier], ...fields }) as unknown as Command;

/** Steps until the soldier has `count` orders left, or a minute passes. */
function runUntilOrders(world: World, count: number): void {
  for (
    let tick = 0;
    tick < 60 * TICK_RATE && entity(world, soldier).orders.length > count;
    tick++
  ) {
    step(world);
  }
}

test("a queued order waits for the ones before it", () => {
  const world = field();
  run(world, 1, [
    order({ type: "move", x: 30, y: 40 }),
    order({ type: "move", x: 26, y: 32, queued: true }),
  ]);
  expect(entity(world, soldier).orders.map((each) => each.type)).toEqual(["move", "move"]);
  runUntilOrders(world, 1);
  expect(entity(world, soldier)).toMatchObject({ x: 30, y: 40 });
  runUntilOrders(world, 0);
  expect(entity(world, soldier)).toMatchObject({ x: 26, y: 32, orders: [] });
});

test("an order that is not queued replaces the queue, and stop empties it", () => {
  const world = field();
  run(world, 1, [
    order({ type: "move", x: 30, y: 40 }),
    order({ type: "move", x: 26, y: 32, queued: true }),
    order({ type: "move", x: 10, y: 40 }),
  ]);
  expect(entity(world, soldier).orders).toEqual([{ type: "move", x: 10, y: 40 }]);
  run(world, 1, [order({ type: "stop", tick: 1 })]);
  const { x } = entity(world, soldier);
  run(world, TICK_RATE);
  expect(entity(world, soldier)).toMatchObject({ x, orders: [] });
});

test("a move walks past enemies, and an attack-move fights them and walks on", () => {
  const moved = field({ x: 40, y: 36 });
  run(moved, 20 * TICK_RATE, [order({ type: "move", x: 55, y: 40 })]);
  expect(entity(moved, enemy).health).toBe(40);
  expect(entity(moved, soldier)).toMatchObject({ x: 55, y: 40 });

  const fought = field({ x: 40, y: 36 });
  run(fought, 1, [order({ type: "attack", x: 55, y: 40 })]);
  let sawFight = false;
  for (let tick = 0; tick < 20 * TICK_RATE; tick++) {
    step(fought);
    const [current, beneath] = entity(fought, soldier).orders;
    if (current?.type === "attack" && beneath?.type === "attackMove") sawFight = true;
  }
  expect(sawFight).toBe(true);
  expect(fought.entities.some((each) => each.id === enemy)).toBe(false);
  expect(entity(fought, soldier)).toMatchObject({ x: 55, y: 40, orders: [] });
});

test("a patrol loops between where it started and the point", () => {
  const world = field();
  run(world, 1, [order({ type: "patrol", x: 30, y: 40 })]);
  expect(entity(world, soldier).orders).toEqual([
    {
      type: "patrol",
      points: [
        { x: 20, y: 40 },
        { x: 30, y: 40 },
      ],
      next: 1,
    },
  ]);
  // Ten units at 4.5 a second takes a little over two seconds each way.
  run(world, 3 * TICK_RATE);
  expect(entity(world, soldier).orders[0]).toMatchObject({ next: 0 });
  run(world, 2 * TICK_RATE);
  expect(entity(world, soldier).orders[0]).toMatchObject({ next: 1 });
});

test("a queued patrol adds a point to the loop", () => {
  const world = field();
  run(world, 1, [
    order({ type: "patrol", x: 30, y: 40 }),
    order({ type: "patrol", x: 30, y: 30, queued: true }),
  ]);
  expect(entity(world, soldier).orders).toHaveLength(1);
  expect(entity(world, soldier).orders[0]).toMatchObject({
    points: [
      { x: 20, y: 40 },
      { x: 30, y: 40 },
      { x: 30, y: 30 },
    ],
  });
});

test("a unit holding its position fires only at what is in weapon range", () => {
  // In acquire range, out of weapon range.
  const far = field({ x: 28, y: 40 });
  run(far, 2 * TICK_RATE, [order({ type: "hold" })]);
  expect(entity(far, soldier)).toMatchObject({ x: 20, y: 40, orders: [{ type: "hold" }] });
  expect(entity(far, enemy).health).toBe(40);

  const near = field({ x: 24, y: 40 });
  run(near, 2 * TICK_RATE, [order({ type: "hold" })]);
  expect(entity(near, soldier)).toMatchObject({ x: 20, y: 40 });
  expect(entity(near, enemy).health).toBeLessThan(40);
});

test("an attack names a target or a point, not both, and queued is a yes or no", () => {
  const world = field({ x: 40, y: 36 });
  run(world, 1, [
    order({ type: "attack", targetId: enemy, x: 30, y: 30 }),
    order({ type: "attack" }),
    order({ type: "move", x: 30, y: 30, queued: "yes" }),
  ]);
  expect(entity(world, soldier).orders).toEqual([]);
});

test("nothing queues behind a hold or a patrol, and a queue holds a bounded number", () => {
  const held = field();
  run(held, 1, [order({ type: "hold" }), order({ type: "move", x: 30, y: 40, queued: true })]);
  expect(entity(held, soldier).orders).toEqual([{ type: "hold" }]);

  const busy = field();
  const moves = Array.from({ length: MAX_ORDERS + 4 }, (_, index) =>
    order({ type: "move", x: 21 + (index % 5), y: 40, queued: true }),
  );
  run(busy, 1, [order({ type: "move", x: 30, y: 40 })]);
  for (let index = 0; index < moves.length; index += MAX_COMMANDS_PER_TICK) {
    run(busy, 1, moves.slice(index, index + MAX_COMMANDS_PER_TICK));
  }
  expect(entity(busy, soldier).orders).toHaveLength(MAX_ORDERS);
});

test("a rule that keeps units still refuses an attack-move but not an attack", () => {
  const world = skirmishWorld({
    edit(raw) {
      raw.placements.push({ definitionId: "soldier", playerId: "red", x: 20, y: 40 });
      raw.placements.push({ definitionId: "worker", playerId: "blue", x: 40, y: 36 });
      raw.commandRules = [
        {
          commands: ["move"],
          conditions: [{ type: "variable", variable: "never", op: "==", value: 1 }],
        },
      ];
      raw.variables = [{ id: "never", value: 0 }];
    },
  });
  run(world, 1, [order({ type: "attack", x: 30, y: 40 })]);
  expect(entity(world, soldier).orders).toEqual([]);
  run(world, 1, [order({ type: "attack", targetId: enemy, tick: 1 })]);
  expect(entity(world, soldier).orders).toEqual([{ type: "attack", targetId: enemy }]);
});
