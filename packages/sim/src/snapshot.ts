import type { CommandType } from "data";
import { usableAbilities } from "./systems.ts";
import { refusedCommands } from "./triggers.ts";
import {
  definitionOf,
  statOf,
  TICK_SECONDS,
  toTicks,
  type Order,
  type Point,
  type World,
} from "./world.ts";

export interface EntitySnapshot {
  readonly id: number;
  readonly definitionId: string;
  readonly playerId: string | null;
  readonly x: number;
  readonly y: number;
  readonly health: number | null;
  /** What `health` is out of, after levels and modifiers. */
  readonly maxHealth: number | null;
  readonly level: number;
  /** Seconds until each ability is ready, in the definition's ability order. */
  readonly abilityCooldowns: readonly number[];
  /** Whether `sim` would take each ability now, apart from its target. */
  readonly abilityUsable: readonly boolean[];
  /** Construction progress from 0 to 1. */
  readonly built: number;
  readonly carrying: number;
  readonly amount: number;
  readonly order: Order["type"] | null;
  /** Where its current route ends. */
  readonly target: Readonly<Point> | null;
  readonly queue: readonly { readonly definitionId: string; readonly progress: number }[];
  /** What it offers for sale, one per slot. Null for a slot already bought. */
  readonly offers: readonly (string | null)[];
}

export interface PlayerSnapshot {
  readonly id: string;
  readonly team: string;
  readonly resources: number;
  readonly defeated: boolean;
}

export interface Snapshot {
  readonly tick: number;
  /** In id order. */
  readonly entities: readonly EntitySnapshot[];
  readonly players: readonly PlayerSnapshot[];
  readonly outcome: { readonly winningTeam: string | null } | null;
  readonly variables: Readonly<Record<string, number>>;
  /** Seconds until each timer fires, or null when it is stopped. */
  readonly timers: Readonly<Record<string, number | null>>;
  /** Command types a command rule refuses now. */
  readonly refusedCommands: readonly CommandType[];
}

/** A copy, so it stays valid after later steps (S8). */
export function takeSnapshot(world: World): Snapshot {
  return {
    tick: world.tick,
    entities: world.entities.map((entity) => {
      const end = entity.path[entity.path.length - 1];
      return {
        id: entity.id,
        definitionId: entity.definitionId,
        playerId: entity.playerId,
        x: entity.x,
        y: entity.y,
        health: entity.health,
        maxHealth: statOf(world, entity, "maxHealth") ?? null,
        level: entity.level,
        abilityCooldowns: entity.abilityCooldowns.map((ticks) => ticks * TICK_SECONDS),
        abilityUsable: usableAbilities(world, entity),
        built: 1 - entity.buildRemaining / toTicks(definitionOf(world, entity).buildTime),
        carrying: entity.carrying,
        amount: entity.amount,
        order: entity.order?.type ?? null,
        target: end === undefined ? null : { x: end.x, y: end.y },
        queue: entity.queue.map((item) => ({
          definitionId: item.definitionId,
          progress: 1 - item.remaining / toTicks(world.definitions[item.definitionId].buildTime),
        })),
        offers: [...entity.offers],
      };
    }),
    players: world.players.map((player) => ({
      id: player.id,
      team: player.team,
      resources: player.resources,
      defeated: player.defeated,
    })),
    outcome: world.outcome === null ? null : { winningTeam: world.outcome.winningTeam },
    variables: { ...world.variables },
    timers: Object.fromEntries(
      world.timers.map((timer) => [
        timer.id,
        timer.remaining === null ? null : timer.remaining * TICK_SECONDS,
      ]),
    ),
    refusedCommands: refusedCommands(world),
  };
}
