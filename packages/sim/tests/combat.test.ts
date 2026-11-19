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
    x: 40,
    y: 40,
  });
  expect(world.entities.some((candidate) => candidate.id === victim)).toBe(false);
  expect(attacker.orders).toEqual([]);
});

test("damage arrives once per cooldown, each shot announced as it fires", () => {
  const world = duel(25);
  const first = run(world, 1, [
    { type: "attack", playerId: "red", tick: 0, unitIds: [soldier], targetId: victim },
  ]);
  expect(entity(world, victim).health).toBe(32);
  expect(first).toEqual([
    {
      type: "fired",
      from: { id: soldier, definitionId: "soldier", playerId: "red", x: 20, y: 40 },
      to: { id: victim, playerId: "blue", x: 25, y: 40 },
    },
  ]);
  expect(run(world, 23)).toEqual([]);
  expect(entity(world, victim).health).toBe(32);
  expect(run(world, 1).map((event) => event.type)).toEqual(["fired"]);
  expect(entity(world, victim).health).toBe(24);
});

test("an idle armed unit attacks an enemy that comes within its acquire range", () => {
  const near = duel(28);
  run(near, 1);
  expect(entity(near, soldier).orders).toEqual([
    { type: "attack", targetId: victim, acquired: true },
  ]);

  const far = duel(31);
  run(far, TICK_RATE);
  expect(entity(far, soldier).orders).toEqual([]);
});

test("units cannot attack their own side or things without health", () => {
  const world = duel(40);
  run(world, 1, [
    { type: "attack", playerId: "red", tick: 0, unitIds: [soldier], targetId: ids.redHq },
    { type: "attack", playerId: "red", tick: 0, unitIds: [soldier], targetId: ids.rocks[0] },
  ]);
  expect(entity(world, soldier).orders).toEqual([]);
});
