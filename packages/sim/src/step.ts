import { advanceReveals, updateFog } from "./fog.ts";
import { AI_INTERVAL, think } from "./ai.ts";
import { applyCommand, inSeatOrder, normalizeCommand, type Command } from "./commands.ts";
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
 *
 * `commands` are this tick's. One stamped for a later tick is dropped, since
 * the world does not hold commands. A `CommandQueue` holds them until their
 * tick. One stamped for an earlier tick applies now.
 */
export function step(world: World, commands: readonly Command[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  if (world.outcome !== null) return events;

  const incoming = [...commands];
  if (world.tick % AI_INTERVAL === 0) {
    for (const player of world.players) {
      if (player.controller !== "ai" || player.defeated) continue;
      incoming.push(...think(world, player));
    }
  }
  // The ai's commands are held to the same shape as everyone else's.
  const due: Command[] = [];
  for (const command of incoming) {
    const clean = normalizeCommand(command);
    if (clean !== null && clean.tick <= world.tick) due.push(clean);
  }
  for (const command of inSeatOrder(world, due)) {
    applyCommand(world, command, events);
  }

  runRespawns(world, events);
  runProduction(world, events);
  runOrders(world, events);
  removeDead(world, events);
  advanceReveals(world);
  runTriggers(world, events);
  runMerges(world, events);
  checkEnd(world, events);
  updateFog(world);
  world.tick += 1;
  return events;
}
