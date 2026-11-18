import { loadScenario } from "data";
import { createWorld, step, type Command, type SimEvent, type World } from "../src/index.ts";
import skirmish from "./fixtures/skirmish.json" with { type: "json" };

/** Entity ids the skirmish fixture assigns, in placement order. */
export const ids = {
  redHq: 1,
  redWorkers: [2, 3, 4],
  redOre: 5,
  blueHq: 7,
  blueWorkers: [8, 9, 10],
  rocks: [13, 14, 15, 16, 17, 18],
  /** The first entity added after the fixture's placements. */
  next: 19,
};

type Raw = Record<string, any>;

/** The skirmish fixture, optionally edited before validation. Blue does nothing unless `ai` is set. */
export function skirmishWorld(
  options: { ai?: boolean; fog?: boolean; edit?: (raw: Raw) => void } = {},
): World {
  const raw: Raw = JSON.parse(JSON.stringify(skirmish));
  raw.fogOfWar = options.fog ?? false;
  if (options.ai !== true) {
    raw.players[1].controller = "human";
    delete raw.players[1].ai;
  }
  options.edit?.(raw);
  return createWorld(loadScenario(raw), 1);
}

export function run(world: World, ticks: number, commands: Command[] = []): SimEvent[] {
  const events = step(world, commands);
  for (let i = 1; i < ticks; i++) events.push(...step(world));
  return events;
}

export function entity(world: World, id: number) {
  const found = world.entities.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`No entity ${id}`);
  return found;
}

export function resources(world: World, playerId: string): number {
  return world.players.find((player) => player.id === playerId)!.resources;
}
