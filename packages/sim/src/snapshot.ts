import type { CommandType } from "data";
import { fogSnapshot, seesEntity, seesPoint, type FogSnapshot } from "./fog.ts";
import { usableAbilities, type SimEvent } from "./systems.ts";
import { refusedCommands } from "./triggers.ts";
import {
  countOwned,
  definitionOf,
  findPlayer,
  findEntity,
  meetsRequirements,
  statOf,
  TICK_SECONDS,
  toTicks,
  type Order,
  type Owned,
  type PlayerState,
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
  readonly abilityCooldowns?: readonly number[];
  /** Whether `sim` would take each ability now, apart from its target. */
  readonly abilityUsable?: readonly boolean[];
  /** Construction progress from 0 to 1. */
  readonly built: number;
  readonly carrying?: number;
  readonly amount: number;
  /** What it is doing now. */
  readonly order?: Order["type"] | null;
  /** The points of its move, attack-move, and patrol orders in the order it will reach them, for drawing. */
  readonly waypoints?: readonly Readonly<Point>[];
  /** Where its current route ends. */
  readonly target?: Readonly<Point> | null;
  /** Units being trained, by `definitionId`, and upgrades being researched, by `upgradeId`. */
  readonly queue?: readonly {
    readonly definitionId?: string;
    readonly upgradeId?: string;
    readonly progress: number;
  }[];
  /** What it offers for sale, one per slot. Null for a slot already bought. */
  readonly offers?: readonly (string | null)[];
}

export interface PlayerSnapshot {
  readonly id: string;
  readonly team: string;
  readonly resources?: number;
  readonly defeated: boolean;
  /** The level researched of every upgrade. */
  readonly upgrades?: Readonly<Record<string, number>>;
  /**
   * Definitions and upgrades whose requirements the player does not meet, so
   * every device greys the same buttons.
   */
  readonly locked?: readonly string[];
}

export interface Snapshot {
  readonly events: readonly Readonly<SimEvent>[];
  readonly fog?: FogSnapshot;
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
export function takeSnapshot(
  world: World,
  viewer: string | null = null,
  events: readonly SimEvent[] = [],
): Snapshot {
  const player = viewer === null ? undefined : findPlayer(world, viewer);
  if (viewer !== null && player === undefined) throw new Error("Unknown snapshot viewer");
  const fog = world.fog && player ? fogSnapshot(world, player.team) : undefined;
  const entities = fog
    ? world.entities.filter((entity) => seesEntity(world, viewer, entity))
    : world.entities;
  const owned = countOwned(world);
  return {
    tick: world.tick,
    events: events
      .filter((event) => !fog || eventForViewer(world, event, viewer!))
      .map((event) =>
        event.type === "merged" ? { ...event, from: [...event.from] } : { ...event },
      ),
    ...(fog && { fog }),
    entities: entities.map((entity) => {
      const end = entity.path[entity.path.length - 1];
      const visible = {
        id: entity.id,
        definitionId: entity.definitionId,
        playerId: entity.playerId,
        x: entity.x,
        y: entity.y,
        health: entity.health,
        maxHealth: statOf(world, entity, "maxHealth") ?? null,
        level: entity.level,
        built: 1 - entity.buildRemaining / toTicks(definitionOf(world, entity).buildTime),
        amount: entity.amount,
      };
      if (fog && entity.playerId !== viewer) return visible;
      return {
        ...visible,
        abilityCooldowns: entity.abilityCooldowns.map((ticks) => ticks * TICK_SECONDS),
        abilityUsable: usableAbilities(world, entity, owned),
        carrying: entity.carrying,
        order: entity.orders[0]?.type ?? null,
        waypoints: entity.orders.flatMap((order) =>
          order.type === "move" || order.type === "attackMove"
            ? [{ x: order.x, y: order.y }]
            : order.type === "patrol"
              ? order.points.map((point) => ({ x: point.x, y: point.y }))
              : [],
        ),
        target:
          end === undefined || (fog && !seesPoint(world, viewer, end))
            ? null
            : { x: end.x, y: end.y },
        queue: entity.queue.map((item) => {
          if ("upgradeId" in item) {
            const time = world.upgrades.find(({ id }) => id === item.upgradeId)!.researchTime;
            return { upgradeId: item.upgradeId, progress: 1 - item.remaining / toTicks(time) };
          }
          const time = world.definitions[item.definitionId].buildTime;
          return { definitionId: item.definitionId, progress: 1 - item.remaining / toTicks(time) };
        }),
        offers: [...entity.offers],
      };
    }),
    players: world.players.map((player) => ({
      id: player.id,
      team: player.team,
      defeated: player.defeated,
      ...((!fog || player.id === viewer) && {
        resources: player.resources,
        upgrades: { ...player.upgrades },
        locked: locked(world, player, owned),
      }),
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

/** Match results are public. Research, production and merges include owner-only information. */
function eventForViewer(world: World, event: SimEvent, viewer: string): boolean {
  switch (event.type) {
    case "ended":
    case "defeated":
      return true;
    case "researched":
    case "died":
    case "produced":
    case "merged":
      return event.playerId === viewer;
    case "completed":
    case "respawned":
    case "leveled": {
      const entity = findEntity(world, event.id);
      return entity !== undefined && seesEntity(world, viewer, entity);
    }
  }
}

function locked(world: World, player: PlayerState, owned: Owned): string[] {
  const ids: string[] = [];
  for (const id of Object.keys(world.definitions)) {
    if (!meetsRequirements(world, player, world.definitions[id].requires, owned)) ids.push(id);
  }
  for (const upgrade of world.upgrades) {
    if (!meetsRequirements(world, player, upgrade.requires, owned)) ids.push(upgrade.id);
  }
  return ids;
}
