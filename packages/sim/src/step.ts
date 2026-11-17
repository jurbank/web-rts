import { AI_INTERVAL, think } from "./ai.ts";
import { applyCommand, enqueueCommand, type Command } from "./commands.ts";
import {
  checkEnd,
  removeDead,
  runMerges,
  runOrders,
  runProduction,
  runRespawns,
  type SimEvent,
} from "./systems.ts";
import { runTriggers } from "./triggers.ts";
import type { World } from "./world.ts";

/**
 * Advances the world one tick and returns what happened. The only place
 * world state changes (S1). A decided game no longer advances.
 */
export function step(world: World, commands: readonly Command[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  if (world.outcome !== null) return events;

  for (const command of commands) {
    enqueueCommand(world, command);
  }
  if (world.tick % AI_INTERVAL === 0) {
    for (const player of world.players) {
      if (player.controller !== "ai" || player.defeated) continue;
      for (const command of think(world, player)) {
        enqueueCommand(world, command);
      }
    }
  }
  while (world.pendingCommands.length > 0 && world.pendingCommands[0].tick <= world.tick) {
    applyCommand(world, world.pendingCommands.shift()!);
  }

  runRespawns(world, events);
  runProduction(world, events);
  runOrders(world, events);
  removeDead(world, events);
  runTriggers(world, events);
  runMerges(world, events);
  checkEnd(world, events);
  world.tick += 1;
  return events;
}
