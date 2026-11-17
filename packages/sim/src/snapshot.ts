import { definitionOf, toTicks, type Order, type Point, type World } from "./world.ts";

export interface EntitySnapshot {
  readonly id: number;
  readonly definitionId: string;
  readonly playerId: string | null;
  readonly x: number;
  readonly y: number;
  readonly health: number | null;
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
      resources: player.resources,
      defeated: player.defeated,
    })),
    outcome: world.outcome === null ? null : { winnerId: world.outcome.winnerId },
    variables: { ...world.variables },
  };
}
