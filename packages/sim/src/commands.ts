import { canUseAbility, isEnemy, useAbility } from "./systems.ts";
import type { CommandType } from "data";
import { refusedCommands } from "./triggers.ts";
import {
  canPlace,
  definitionOf,
  findDefinition,
  findEntity,
  findPlayer,
  spawn,
  toTicks,
  type Entity,
  type World,
} from "./world.ts";

interface CommandBase {
  playerId: string;
  /** The tick the command takes effect. A tick already past means now. */
  tick: number;
}

export interface MoveCommand extends CommandBase {
  type: "move";
  unitIds: number[];
  x: number;
  y: number;
}

export interface AttackCommand extends CommandBase {
  type: "attack";
  unitIds: number[];
  targetId: number;
}

export interface GatherCommand extends CommandBase {
  type: "gather";
  unitIds: number[];
  nodeId: number;
}

/** Starts a new building and sends the units to construct it. */
export interface BuildCommand extends CommandBase {
  type: "build";
  unitIds: number[];
  definitionId: string;
  x: number;
  y: number;
}

/** Sends units to work on a building that is already under construction. */
export interface AssistCommand extends CommandBase {
  type: "assist";
  unitIds: number[];
  buildingId: number;
}

export interface ProduceCommand extends CommandBase {
  type: "produce";
  buildingId: number;
  definitionId: string;
  /**
   * The offer slot being bought. Refused unless that slot still holds
   * `definitionId`, so a repeated tap or one made before a reroll buys nothing.
   */
  slot?: number;
}

/** Uses one of a unit's abilities. One that targets an enemy needs `targetId`. */
export interface CastCommand extends CommandBase {
  type: "cast";
  unitId: number;
  abilityId: string;
  targetId?: number;
}

export type Command =
  | CastCommand
  | MoveCommand
  | AttackCommand
  | GatherCommand
  | BuildCommand
  | AssistCommand
  | ProduceCommand;

/** Command rules name command types in scenario data, so `data`'s list must match these exactly. */
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const commandTypesMatch: Exactly<Command["type"], CommandType> = true;
void commandTypesMatch;

const isId = (value: unknown): value is number => Number.isInteger(value);
const isIds = (value: unknown): value is number[] => Array.isArray(value) && value.every(isId);
const isText = (value: unknown): value is string => typeof value === "string";
const isFinite = (value: unknown): value is number => Number.isFinite(value);

/**
 * Returns a clean copy holding only known fields, or null when the command is
 * malformed. Non-finite numbers and negative zero do not survive JSON, so they
 * never enter world state (S7).
 */
export function normalizeCommand(input: Command): Command | null {
  const raw = input as unknown as Record<string, unknown>;
  const { playerId, tick, unitIds, x, y, targetId, nodeId, buildingId, definitionId } = raw;
  const { unitId, abilityId, slot } = raw;
  if (!isText(playerId) || !isId(tick)) return null;
  const base = { playerId, tick: tick + 0 };
  const ids = () => (unitIds as number[]).map((id) => id + 0);
  switch (raw.type) {
    case "move":
      if (!isIds(unitIds) || !isFinite(x) || !isFinite(y)) return null;
      return { ...base, type: "move", unitIds: ids(), x: x + 0, y: y + 0 };
    case "attack":
      if (!isIds(unitIds) || !isId(targetId)) return null;
      return { ...base, type: "attack", unitIds: ids(), targetId: targetId + 0 };
    case "gather":
      if (!isIds(unitIds) || !isId(nodeId)) return null;
      return { ...base, type: "gather", unitIds: ids(), nodeId: nodeId + 0 };
    case "build":
      if (!isIds(unitIds) || !isText(definitionId) || !isFinite(x) || !isFinite(y)) return null;
      return { ...base, type: "build", unitIds: ids(), definitionId, x: x + 0, y: y + 0 };
    case "assist":
      if (!isIds(unitIds) || !isId(buildingId)) return null;
      return { ...base, type: "assist", unitIds: ids(), buildingId: buildingId + 0 };
    case "produce": {
      if (!isId(buildingId) || !isText(definitionId)) return null;
      if (slot !== undefined && !isId(slot)) return null;
      const produce: ProduceCommand = {
        ...base,
        type: "produce",
        buildingId: buildingId + 0,
        definitionId,
      };
      if (slot !== undefined) produce.slot = slot + 0;
      return produce;
    }
    case "cast": {
      if (!isId(unitId) || !isText(abilityId)) return null;
      if (targetId !== undefined && !isId(targetId)) return null;
      const cast: CastCommand = { ...base, type: "cast", unitId: unitId + 0, abilityId };
      if (targetId !== undefined) cast.targetId = targetId + 0;
      return cast;
    }
    default:
      return null;
  }
}

/**
 * Commands for one tick apply in player order, so every device that holds the
 * same commands applies them the same way, whatever order they arrived in.
 * A player's own commands keep the order that player sent them.
 */
export function enqueueCommand(world: World, command: Command): void {
  const clean = normalizeCommand(command);
  if (clean === null) return;
  const seat = (playerId: string) => world.players.findIndex((player) => player.id === playerId);
  const cleanSeat = seat(clean.playerId);
  const isLater = (queued: Command) =>
    queued.tick > clean.tick || (queued.tick === clean.tick && seat(queued.playerId) > cleanSeat);
  const queue = world.pendingCommands;
  let index = queue.length;
  while (index > 0 && isLater(queue[index - 1])) {
    index -= 1;
  }
  queue.splice(index, 0, clean);
}

/** The player's mobile units among `ids`, in id order. */
function ownUnits(world: World, playerId: string, ids: readonly number[]): Entity[] {
  return world.entities.filter(
    (entity) =>
      entity.playerId === playerId &&
      ids.includes(entity.id) &&
      definitionOf(world, entity).speed !== undefined,
  );
}

function giveOrder(entity: Entity, order: Entity["order"]): void {
  entity.order = order;
  entity.path = [];
  entity.pathGoal = null;
}

export function applyCommand(world: World, command: Command): void {
  const player = findPlayer(world, command.playerId);
  // A `none` player is moved only by triggers.
  if (player === undefined || player.defeated || player.controller === "none") return;
  if (world.commandRules.length > 0 && refusedCommands(world).includes(command.type)) return;

  switch (command.type) {
    case "move": {
      const units = ownUnits(world, player.id, command.unitIds);
      const columns = Math.ceil(Math.sqrt(units.length));
      const rows = Math.ceil(units.length / columns);
      let spacing = 0;
      for (const unit of units) {
        spacing = Math.max(spacing, definitionOf(world, unit).radius * 2 + 0.4);
      }
      units.forEach((unit, index) => {
        const column = index % columns;
        const row = (index - column) / columns;
        giveOrder(unit, {
          type: "move",
          x: clamp(command.x + (column - (columns - 1) / 2) * spacing, 0, world.map.width),
          y: clamp(command.y + (row - (rows - 1) / 2) * spacing, 0, world.map.height),
        });
      });
      return;
    }
    case "attack": {
      const target = findEntity(world, command.targetId);
      if (target === undefined) return;
      for (const unit of ownUnits(world, player.id, command.unitIds)) {
        if (definitionOf(world, unit).weapon !== undefined && isEnemy(world, unit, target)) {
          giveOrder(unit, { type: "attack", targetId: target.id });
        }
      }
      return;
    }
    case "gather": {
      const node = findEntity(world, command.nodeId);
      if (node === undefined || definitionOf(world, node).resource === undefined) return;
      for (const unit of ownUnits(world, player.id, command.unitIds)) {
        if (definitionOf(world, unit).gatherer !== undefined) {
          giveOrder(unit, { type: "gather", nodeId: node.id, returning: false, progress: 0 });
        }
      }
      return;
    }
    case "build": {
      const definition = findDefinition(world, command.definitionId);
      if (definition === undefined) return;
      const builders = ownUnits(world, player.id, command.unitIds).filter((unit) =>
        definitionOf(world, unit).builds.includes(definition.id),
      );
      if (builders.length === 0 || player.resources < definition.cost) return;
      if (!canPlace(world, definition, command.x, command.y)) return;
      player.resources -= definition.cost;
      const building = spawn(world, definition.id, player.id, command.x, command.y);
      building.buildRemaining = toTicks(definition.buildTime);
      if (building.health !== null) building.health /= building.buildRemaining;
      for (const builder of builders) {
        giveOrder(builder, { type: "build", buildingId: building.id });
      }
      // The new footprint may cut through routes computed before it existed.
      for (const entity of world.entities) {
        entity.path = [];
        entity.pathGoal = null;
      }
      return;
    }
    case "assist": {
      const building = findEntity(world, command.buildingId);
      if (building === undefined || building.playerId !== player.id) return;
      if (building.buildRemaining === 0) return;
      for (const unit of ownUnits(world, player.id, command.unitIds)) {
        if (definitionOf(world, unit).builds.includes(building.definitionId)) {
          giveOrder(unit, { type: "build", buildingId: building.id });
        }
      }
      return;
    }
    case "cast": {
      const unit = findEntity(world, command.unitId);
      if (unit === undefined || unit.playerId !== player.id || unit.buildRemaining > 0) return;
      const { abilities } = definitionOf(world, unit);
      const index = abilities.findIndex((ability) => ability.id === command.abilityId);
      if (index < 0 || !canUseAbility(world, unit, index)) return;
      const ability = abilities[index];
      if (ability.target === "self") {
        useAbility(world, unit, index, unit);
        return;
      }
      const target =
        command.targetId === undefined ? undefined : findEntity(world, command.targetId);
      if (target === undefined || !isEnemy(world, unit, target)) return;
      giveOrder(unit, { type: "cast", ability: index, targetId: target.id });
      return;
    }
    case "produce": {
      const building = findEntity(world, command.buildingId);
      const definition = findDefinition(world, command.definitionId);
      if (building === undefined || definition === undefined) return;
      if (building.playerId !== player.id || building.buildRemaining > 0) return;
      const named = command.slot;
      const trained =
        named === undefined && definitionOf(world, building).produces.includes(definition.id);
      const slot = named ?? building.offers.indexOf(definition.id);
      if (!trained && building.offers[slot] !== definition.id) return;
      const { queueLimit } = definitionOf(world, building);
      if (building.queue.length >= queueLimit || player.resources < definition.cost) return;
      player.resources -= definition.cost;
      if (!trained) building.offers[slot] = null;
      building.queue.push({
        definitionId: definition.id,
        remaining: toTicks(definition.buildTime),
      });
      return;
    }
  }
}

/** Adding zero turns -0 into 0, which JSON would otherwise do on save. */
function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value + 0;
}
