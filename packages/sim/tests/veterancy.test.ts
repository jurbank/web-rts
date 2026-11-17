import { expect, test } from "vite-plus/test";
import { TICK_RATE, type Command, type World } from "../src/index.ts";
import { entity, ids, run, skirmishWorld } from "./helpers.ts";

const [veteran, bystander] = [ids.next, ids.next + 1];
const victim = ids.next + 2;

/** Two red soldiers with veterancy and a blue worker worth one level. */
function veterans(edit?: (raw: Record<string, any>) => void): World {
  return skirmishWorld({
    edit(raw) {
      for (const definition of raw.definitions) {
        if (definition.id === "soldier") {
          definition.levels = {
            thresholds: [10, 20],
            credit: "killer",
            perLevel: [{ stat: "damage", add: 2 }],
          };
        }
        if (definition.id === "worker") definition.experience = 10;
      }
      raw.placements.push({ definitionId: "soldier", playerId: "red", x: 20, y: 40 });
      raw.placements.push({ definitionId: "soldier", playerId: "red", x: 20, y: 44 });
      raw.placements.push({ definitionId: "worker", playerId: "blue", x: 28, y: 40 });
      edit?.(raw);
    },
  });
}

const attack = (unitIds: number[], targetId = victim, tick = 0): Command => ({
  type: "attack",
  playerId: "red",
  tick,
  unitIds,
  targetId,
});

test("only the unit that lands the killing blow gains a kill's experience", () => {
  const world = veterans();
  const events = run(world, 10 * TICK_RATE, [attack([veteran])]);
  expect(world.entities.some((each) => each.id === victim)).toBe(false);
  expect(entity(world, veteran)).toMatchObject({ level: 2, experience: 0 });
  expect(entity(world, bystander)).toMatchObject({ level: 1, experience: 0 });
  expect(events).toContainEqual({ type: "leveled", id: veteran, level: 2 });
});

test("a kill made on one tick by two units goes to one of them, by a seeded draw", () => {
  const levels = () => {
    // Both soldiers start in reach, so they hit together from the first tick.
    const world = veterans((raw) => {
      raw.placements[raw.placements.length - 1] = {
        definitionId: "worker",
        playerId: "blue",
        x: 23,
        y: 42,
      };
    });
    run(world, 10 * TICK_RATE, [attack([veteran, bystander])]);
    return [entity(world, veteran).level, entity(world, bystander).level];
  };
  const result = levels();
  expect(result.toSorted((a, b) => a - b)).toEqual([1, 2]);
  expect(levels()).toEqual(result);
});

test("a veteran hits harder by what its levels add", () => {
  const second = victim + 1;
  const world = veterans((raw) => {
    raw.placements.push({ definitionId: "worker", playerId: "blue", x: 50, y: 44 });
  });
  run(world, 10 * TICK_RATE, [attack([veteran])]);
  expect(entity(world, veteran).level).toBe(2);
  const health = entity(world, second).health!;
  run(world, 1, [attack([veteran], second, world.tick)]);
  for (let tick = 0; tick < 20 * TICK_RATE && entity(world, second).health === health; tick++) {
    run(world, 1);
  }
  // A soldier deals 8, and level 2 adds 2.
  expect(health - entity(world, second).health!).toBe(10);
});

test("triggers grant experience and hear the level-ups it brings on the next tick", () => {
  const world = veterans((raw) => {
    raw.triggers.push(
      {
        id: "drill",
        event: { type: "start" },
        actions: [
          { type: "grantExperience", playerId: "red", definitionIds: ["soldier"], amount: 10 },
        ],
      },
      {
        id: "promotion",
        event: { type: "leveled", definitionIds: ["soldier"], level: 2 },
        actions: [{ type: "grantResources", playerId: "$triggering", amount: 25 }],
      },
    );
  });
  const resources = () => world.players.find((player) => player.id === "red")!.resources;
  const before = resources();
  const events = run(world, 1);
  expect([entity(world, veteran).level, entity(world, bystander).level]).toEqual([2, 2]);
  expect(events.filter((event) => event.type === "leveled")).toHaveLength(2);
  expect(resources()).toBe(before);
  run(world, 1);
  expect(resources()).toBe(before + 50);
});

test("a trigger that promotes what it spawns on every level-up still lets each tick end", () => {
  const world = veterans((raw) => {
    raw.waypoints = [{ id: "camp", x: 10, y: 10 }];
    raw.triggers.push(
      {
        id: "drill",
        event: { type: "start" },
        actions: [{ type: "grantExperience", definitionIds: ["soldier"], amount: 10 }],
      },
      {
        id: "recruit",
        event: { type: "leveled", definitionIds: ["soldier"] },
        actions: [
          { type: "spawn", definitionId: "soldier", playerId: "red", at: "camp" },
          { type: "grantExperience", definitionIds: ["soldier"], amount: 10 },
        ],
      },
    );
  });
  const soldiers = () => world.entities.filter((each) => each.definitionId === "soldier").length;
  // Each tick fires only the level-ups the last tick's actions caused.
  const counts = [0, 1, 2].map(() => {
    run(world, 1);
    return soldiers();
  });
  expect(counts[0]).toBe(2);
  expect(counts[1]).toBeGreaterThan(counts[0]);
  expect(counts[2]).toBeGreaterThan(counts[1]);
});

test("an ability can give experience to what it lands on", () => {
  const world = veterans((raw) => {
    const soldier = raw.definitions.find(
      (definition: { id: string }) => definition.id === "soldier",
    );
    soldier.abilities = [
      {
        id: "study",
        name: "Study",
        cooldown: 1,
        target: "self",
        effects: [{ type: "experience", amount: 30 }],
      },
    ];
  });
  run(world, 1, [{ type: "cast", playerId: "red", tick: 0, unitId: veteran, abilityId: "study" }]);
  expect(entity(world, veteran)).toMatchObject({ level: 3, experience: 0 });
});
