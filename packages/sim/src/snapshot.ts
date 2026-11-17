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
  /** Construction progress from 0 to 1. */
  readonly built: number;
  readonly carrying: number;
  readonly amount: number;
  readonly order: Order["type"] | null;
  /** Where its current route ends. */
  readonly target: Readonly<Point> | null;
  readonly queue: readonly { readonly definitionId: string; readonly progress: number }[];
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
  readonly outcome: { readonly winnerId: string | null } | null;
  readonly variables: Readonly<Record<string, number>>;
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
        built: 1 - entity.buildRemaining / toTicks(definitionOf(world, entity).buildTime),
        carrying: entity.carrying,
        amount: entity.amount,
        order: entity.order?.type ?? null,
        target: end === undefined ? null : { x: end.x, y: end.y },
        queue: entity.queue.map((item) => ({
          definitionId: item.definitionId,
          progress: 1 - item.remaining / toTicks(world.definitions[item.definitionId].buildTime),
        })),
      };
    }),
    players: world.players.map((player) => ({
      id: player.id,
      team: player.team,
      resources: player.resources,
      defeated: player.defeated,
    })),
    outcome: world.outcome === null ? null : { winnerId: world.outcome.winnerId },
    variables: { ...world.variables },
  };
}
