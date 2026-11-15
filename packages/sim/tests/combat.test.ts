import { expect, test } from "vite-plus/test";
import { TICK_RATE } from "../src/index.ts";
import { entity, ids, run, skirmishWorld } from "./helpers.ts";

const soldier = ids.next;
const victim = ids.next + 1;

function duel(victimX: number) {
  return skirmishWorld({
    edit(raw) {
      raw.placements.push({ definitionId: "soldier", playerId: "red", x: 20, y: 40 });
      raw.placements.push({ definitionId: "worker", playerId: "blue", x: victimX, y: 40 });
    },
  });
}

test("an attack order closes to weapon range, deals damage on cooldown, and kills", () => {
  const world = duel(40);
  const events = run(world, 3 * TICK_RATE, [
    { type: "attack", playerId: "red", tick: 0, unitIds: [soldier], targetId: victim },
  ]);
  const attacker = entity(world, soldier);
  // Range 5 to the victim's edge, radius 0.5.
  expect(40 - attacker.x).toBeGreaterThan(5);
  expect(entity(world, victim).health).toBe(40);

  events.push(...run(world, 8 * TICK_RATE));
  expect(40 - attacker.x).toBeLessThanOrEqual(5.5);
  expect(events).toContainEqual({
    type: "died",
    id: victim,
    definitionId: "worker",
    playerId: "blue",
  });
  expect(world.entities.some((candidate) => candidate.id === victim)).toBe(false);
  expect(attacker.order).toBeNull();
});

test("damage arrives once per cooldown", () => {
  const world = duel(25);
  run(world, 1, [
    { type: "attack", playerId: "red", tick: 0, unitIds: [soldier], targetId: victim },
  ]);
  expect(entity(world, victim).health).toBe(32);
  run(world, 23);
  expect(entity(world, victim).health).toBe(32);
  run(world, 1);
  expect(entity(world, victim).health).toBe(24);
});

test("an idle armed unit attacks an enemy that comes within its acquire range", () => {
  const near = duel(28);
  run(near, 1);
  expect(entity(near, soldier).order).toEqual({ type: "attack", targetId: victim });

  const far = duel(31);
  run(far, TICK_RATE);
  expect(entity(far, soldier).order).toBeNull();
});

test("units cannot attack their own side or things without health", () => {
  const world = duel(40);
  run(world, 1, [
    { type: "attack", playerId: "red", tick: 0, unitIds: [soldier], targetId: ids.redHq },
    { type: "attack", playerId: "red", tick: 0, unitIds: [soldier], targetId: ids.rocks[0] },
  ]);
  expect(entity(world, soldier).order).toBeNull();
});
