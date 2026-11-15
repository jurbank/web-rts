import { expect, test } from "vite-plus/test";
import { step, TICK_RATE } from "../src/index.ts";
import { entity, ids, run, skirmishWorld } from "./helpers.ts";

const worker = ids.redWorkers[0];

test("a unit walks around a wall of obstacles and never enters one", () => {
  const world = skirmishWorld();
  const unit = entity(world, worker);
  const rocks = ids.rocks.map((id) => entity(world, id));
  const goal = { x: 44, y: 24 };
  step(world, [{ type: "move", playerId: "red", tick: 0, unitIds: [worker], ...goal }]);
  let ticks = 1;
  while (unit.order !== null && ticks < 60 * TICK_RATE) {
    step(world);
    ticks += 1;
    for (const rock of rocks) {
      expect(Math.hypot(unit.x - rock.x, unit.y - rock.y)).toBeGreaterThanOrEqual(1.5);
    }
  }
  expect(unit).toMatchObject({ ...goal, order: null });
  const straightLineTicks = ((goal.x - 12) / 4) * TICK_RATE;
  expect(ticks).toBeGreaterThan(straightLineTicks * 1.15);
});

test("a move into an obstacle ends at the nearest reachable spot", () => {
  const world = skirmishWorld();
  const rock = entity(world, ids.rocks[3]);
  run(world, 20 * TICK_RATE, [
    { type: "move", playerId: "red", tick: 0, unitIds: [worker], x: rock.x, y: rock.y },
  ]);
  const unit = entity(world, worker);
  const gap = Math.hypot(unit.x - rock.x, unit.y - rock.y);
  expect(unit.order).toBeNull();
  expect(gap).toBeGreaterThanOrEqual(1.5);
  expect(gap).toBeLessThan(4);
});
