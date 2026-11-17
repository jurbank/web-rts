import { createWorld, hashWorld, loadWorld, saveWorld, step, TICK_RATE, type World } from "sim";
import { expect, test } from "vite-plus/test";
import { examples } from "../src/examples.ts";

const TICKS = 3 * 60 * TICK_RATE;
const SEED = 1;

/** The shipped scenario with an ai in every human seat, so every side acts. */
function aiWorld(index: number): World {
  const scenario = examples[index].scenario;
  const settings = scenario.players.find((player) => player.ai !== undefined)?.ai ?? {
    workers: 5,
    attackSize: 5,
  };
  const players = scenario.players.map((player) =>
    player.controller === "human" ? { ...player, controller: "ai" as const, ai: settings } : player,
  );
  return createWorld({ ...scenario, players }, SEED);
}

function expectSane(world: World) {
  for (const player of world.players) {
    expect(Number.isFinite(player.resources) && player.resources >= 0, player.id).toBe(true);
  }
  for (const entity of world.entities) {
    const where = `entity ${entity.id} at tick ${world.tick}`;
    expect(Number.isFinite(entity.x) && Number.isFinite(entity.y), where).toBe(true);
    expect(entity.x >= 0 && entity.x <= world.map.width, where).toBe(true);
    expect(entity.y >= 0 && entity.y <= world.map.height, where).toBe(true);
    expect(entity.health === null || Number.isFinite(entity.health), where).toBe(true);
  }
}

test.each(examples.map((example, index) => [example.name, index] as const))(
  "%s runs headless for three minutes and replays the same",
  (_name, index) => {
    const first = aiWorld(index);
    for (let i = 0; i < TICKS; i++) {
      step(first);
      expectSane(first);
    }

    let second = aiWorld(index);
    for (let i = 0; i < TICKS; i++) {
      if (i === TICKS / 2) second = loadWorld(saveWorld(second));
      step(second);
    }

    expect(hashWorld(second)).toBe(hashWorld(first));
  },
);
