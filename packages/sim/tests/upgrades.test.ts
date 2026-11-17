import { expect, test } from "vite-plus/test";
import {
  hashWorld,
  loadWorld,
  saveWorld,
  step,
  takeSnapshot,
  TICK_RATE,
  type Command,
  type World,
} from "../src/index.ts";
import { statOf } from "../src/world.ts";
import { entity, ids, resources, run, skirmishWorld } from "./helpers.ts";

const barracks = ids.next;
const soldier = ids.next + 1;
const worker = ids.redWorkers[0];

/** Red owns a finished barracks that researches two upgrades, and a soldier. */
function armory(edit?: (raw: Record<string, any>) => void): World {
  return skirmishWorld({
    edit(raw) {
      for (const definition of raw.definitions) {
        if (definition.id === "soldier" || definition.id === "worker") {
          definition.tags = ["infantry"];
        }
        if (definition.id === "barracks") definition.researches = ["weapons", "plating"];
      }
      raw.upgrades = [
        {
          id: "weapons",
          name: "Weapons",
          cost: 50,
          researchTime: 1,
          levels: 2,
          tags: ["infantry"],
          modifiers: [{ stat: "damage", add: 2 }],
        },
        {
          id: "plating",
          name: "Plating",
          cost: 50,
          researchTime: 1,
          definitionIds: ["soldier"],
          modifiers: [{ stat: "armor", add: 1 }],
          requires: [{ type: "upgrade", upgrade: "weapons" }],
        },
      ];
      raw.players[0].resources = 500;
      raw.placements.push({ definitionId: "barracks", playerId: "red", x: 20, y: 30 });
      raw.placements.push({ definitionId: "soldier", playerId: "red", x: 20, y: 40 });
      edit?.(raw);
    },
  });
}

const research = (
  upgradeId: string,
  tick = 0,
  playerId = "red",
  buildingId = barracks,
): Command => ({
  type: "research",
  playerId,
  tick,
  buildingId,
  upgradeId,
});

const red = (world: World) => world.players.find((player) => player.id === "red")!;

test("an upgrade reaches every matching unit, including ones made after it", () => {
  const world = armory();
  run(world, TICK_RATE + 1, [research("weapons")]);
  expect(red(world).upgrades).toEqual({ weapons: 1, plating: 0 });
  expect(statOf(world, entity(world, soldier), "damage")).toBe(10);
  run(world, 1, [
    {
      type: "produce",
      playerId: "red",
      tick: world.tick,
      buildingId: barracks,
      definitionId: "soldier",
    },
  ]);
  while (world.entities.filter((each) => each.definitionId === "soldier").length < 2) step(world);
  const trained = world.entities.filter((each) => each.definitionId === "soldier").at(-1)!;
  expect(statOf(world, trained, "damage")).toBe(10);
  // A worker is infantry too, but has no weapon to make stronger.
  expect(statOf(world, entity(world, worker), "damage")).toBeUndefined();
});

test("research counts levels already queued, and pays when it starts", () => {
  const world = armory();
  run(world, 1, [research("weapons"), research("weapons"), research("weapons")]);
  expect(entity(world, barracks).queue).toHaveLength(2);
  expect(resources(world, "red")).toBe(400);
  run(world, 2 * TICK_RATE);
  expect(red(world).upgrades.weapons).toBe(2);
  run(world, 1, [research("weapons", world.tick)]);
  expect(entity(world, barracks).queue).toHaveLength(0);
});

test("a requirement locks research until it is met, and the snapshot says so", () => {
  const world = armory();
  expect(takeSnapshot(world).players[0].locked).toEqual(["plating"]);
  run(world, 1, [research("plating")]);
  expect(entity(world, barracks).queue).toHaveLength(0);
  run(world, TICK_RATE + 1, [research("weapons", world.tick)]);
  expect(takeSnapshot(world).players[0].locked).toEqual([]);
  run(world, TICK_RATE + 1, [research("plating", world.tick)]);
  expect(statOf(world, entity(world, soldier), "armor")).toBe(1);
});

test("training and building wait for what a definition requires", () => {
  const world = armory((raw) => {
    const definition = raw.definitions.find((each: { id: string }) => each.id === "soldier");
    definition.requires = [{ type: "upgrade", upgrade: "plating" }];
  });
  const train: Command = {
    type: "produce",
    playerId: "red",
    tick: 0,
    buildingId: barracks,
    definitionId: "soldier",
  };
  run(world, 1, [train]);
  expect(entity(world, barracks).queue).toHaveLength(0);
  expect(takeSnapshot(world).players[0].locked).toContain("soldier");
});

test("armor takes from each weapon hit, down to half a point", () => {
  const world = armory((raw) => {
    const definition = raw.definitions.find((each: { id: string }) => each.id === "worker");
    definition.armor = 10;
    raw.placements.push({ definitionId: "worker", playerId: "blue", x: 24, y: 40 });
  });
  const victim = ids.next + 2;
  run(world, 1);
  expect(entity(world, victim).health).toBe(39.5);
});

test("modifiers add first and multiply after, on weapon range and cooldown too", () => {
  const world = armory((raw) => {
    raw.upgrades[0].modifiers = [
      { stat: "range", add: 1 },
      { stat: "range", multiply: 2 },
      { stat: "cooldown", multiply: 0.5 },
    ];
  });
  run(world, TICK_RATE + 1, [research("weapons")]);
  const unit = entity(world, soldier);
  expect(statOf(world, unit, "range")).toBe((5 + 1) * 2);
  expect(statOf(world, unit, "cooldown")).toBe(0.4);
});

test("an ability waits for what it requires", () => {
  const world = armory((raw) => {
    const definition = raw.definitions.find((each: { id: string }) => each.id === "soldier");
    definition.abilities = [
      {
        id: "rally",
        name: "Rally",
        cooldown: 1,
        target: "self",
        requires: [{ type: "upgrade", upgrade: "weapons" }],
        effects: [{ type: "modify", stat: "speed", add: 1, seconds: 1 }],
      },
    ];
  });
  const usable = () =>
    takeSnapshot(world).entities.find((each) => each.id === soldier)!.abilityUsable[0];
  expect(usable()).toBe(false);
  run(world, TICK_RATE + 1, [research("weapons")]);
  expect(usable()).toBe(true);
});

test("a save and load while research is queued and after it lands keeps the hash", () => {
  const play = (saveAt: number | null) => {
    let world = armory();
    for (let tick = 0; tick < 4 * TICK_RATE; tick++) {
      if (tick === saveAt) world = loadWorld(saveWorld(world));
      step(world, tick === 0 ? [research("weapons"), research("weapons")] : []);
    }
    return hashWorld(world);
  };
  const expected = play(null);
  // Mid-research, between the two levels, and after both.
  for (const saveAt of [10, TICK_RATE + 10, 3 * TICK_RATE]) expect(play(saveAt)).toBe(expected);
});

test("two players researching on one tick land the same in either arrival order", () => {
  const play = (redFirst: boolean) => {
    const world = armory((raw) => {
      raw.players[1].resources = 500;
      raw.placements.push({ definitionId: "barracks", playerId: "blue", x: 44, y: 30 });
    });
    const blue = research("weapons", 0, "blue", ids.next + 2);
    run(world, 2 * TICK_RATE, redFirst ? [research("weapons"), blue] : [blue, research("weapons")]);
    return world;
  };
  const world = play(true);
  expect(world.players.map((player) => player.upgrades.weapons)).toEqual([1, 1]);
  expect(hashWorld(world)).toBe(hashWorld(play(false)));
});
