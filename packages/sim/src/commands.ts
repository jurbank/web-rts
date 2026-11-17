import { canUseAbility, defeatPlayer, isEnemy, useAbility, type SimEvent } from "./systems.ts";
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
  TICK_RATE,
  type Entity,
  type Order,
  type Point,
  type World,
} from "./world.ts";

interface CommandBase {
  playerId: string;
  /** The tick the command takes effect. A tick already past means now. */
  tick: number;
}

/** A command that orders units. */
interface UnitCommand extends CommandBase {
  unitIds: number[];
  /** Adds the order after the ones the units already have, instead of replacing them. */
  queued?: boolean;
}

export interface MoveCommand extends UnitCommand {
  type: "move";
  x: number;
  y: number;
}

/** Attacks `targetId`, or, given a point instead, moves there fighting what it meets. */
export interface AttackCommand extends UnitCommand {
  type: "attack";
  targetId?: number;
  x?: number;
  y?: number;
}

/** Walks between where each unit is and the point, fighting what it meets, until told otherwise. */
export interface PatrolCommand extends UnitCommand {
  type: "patrol";
  x: number;
  y: number;
}

/** Stays put, firing at enemies in weapon range, until told otherwise. */
export interface HoldCommand extends UnitCommand {
  type: "hold";
}

/** Drops every order the units have. */
export interface StopCommand extends CommandBase {
  type: "stop";
  unitIds: number[];
}

export interface GatherCommand extends UnitCommand {
  type: "gather";
  nodeId: number;
}

/** Starts a new building and sends the units to construct it. */
export interface BuildCommand extends UnitCommand {
  type: "build";
  definitionId: string;
  x: number;
  y: number;
}

/** Sends units to work on a building that is already under construction. */
export interface AssistCommand extends UnitCommand {
  type: "assist";
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
  /** Adds the cast after the unit's other orders. One that targets the caster applies at once. */
  queued?: boolean;
}

/** The player leaves the match and is defeated. Their team plays on. */
export interface ConcedeCommand extends CommandBase {
  type: "concede";
}

/** Orders for units and buildings. Command rules may refuse them. */
export type OrderCommand =
  | CastCommand
  | MoveCommand
  | AttackCommand
  | PatrolCommand
  | HoldCommand
  | StopCommand
  | GatherCommand
  | BuildCommand
  | AssistCommand
  | ProduceCommand;

/** About the player's place in the match, not the game in it. Command rules never refuse them. */
export type SessionCommand = ConcedeCommand;

export type Command = OrderCommand | SessionCommand;

/** Command rules name order types in scenario data, so `data`'s list must match these exactly. */
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const commandTypesMatch: Exactly<OrderCommand["type"], CommandType> = true;
void commandTypesMatch;

/** The most units one command may name. More is a malformed command. */
export const MAX_UNIT_IDS = 1000;

/** How far ahead of the current tick a command may be stamped, so nobody can fill the queue. */
export const COMMAND_HORIZON = 10 * TICK_RATE;

/** The most commands the queue holds for one player on one tick. */
export const MAX_COMMANDS_PER_TICK = 32;

/** The most orders one entity holds, and the most points one patrol visits. */
export const MAX_ORDERS = 16;

const isId = (value: unknown): value is number => Number.isInteger(value);
const isIds = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length <= MAX_UNIT_IDS && value.every(isId);
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
  const { unitId, abilityId, slot, queued } = raw;
  if (!isText(playerId) || !isId(tick)) return null;
  if (queued !== undefined && typeof queued !== "boolean") return null;
  const base = { playerId, tick: tick + 0 };
  // Only a queued command carries the field, so an unqueued one hashes as before.
  const queue = queued === true ? { queued: true } : {};
  const ids = () => [...new Set((unitIds as number[]).map((id) => id + 0))];
  const isPoint = isFinite(x) && isFinite(y);
  switch (raw.type) {
    case "move":
      if (!isIds(unitIds) || !isPoint) return null;
      return { ...base, ...queue, type: "move", unitIds: ids(), x: x + 0, y: y + 0 };
    case "attack":
      if (!isIds(unitIds)) return null;
      if (targetId !== undefined) {
        if (!isId(targetId) || x !== undefined || y !== undefined) return null;
        return { ...base, ...queue, type: "attack", unitIds: ids(), targetId: targetId + 0 };
      }
      if (!isPoint) return null;
      return { ...base, ...queue, type: "attack", unitIds: ids(), x: x + 0, y: y + 0 };
    case "patrol":
      if (!isIds(unitIds) || !isPoint) return null;
      return { ...base, ...queue, type: "patrol", unitIds: ids(), x: x + 0, y: y + 0 };
    case "hold":
      if (!isIds(unitIds)) return null;
      return { ...base, ...queue, type: "hold", unitIds: ids() };
    case "stop":
      if (!isIds(unitIds)) return null;
      return { ...base, type: "stop", unitIds: ids() };
    case "gather":
      if (!isIds(unitIds) || !isId(nodeId)) return null;
      return { ...base, ...queue, type: "gather", unitIds: ids(), nodeId: nodeId + 0 };
    case "build":
      if (!isIds(unitIds) || !isText(definitionId) || !isPoint) return null;
      return { ...base, ...queue, type: "build", unitIds: ids(), definitionId, x: x + 0, y: y + 0 };
    case "assist":
      if (!isIds(unitIds) || !isId(buildingId)) return null;
      return { ...base, ...queue, type: "assist", unitIds: ids(), buildingId: buildingId + 0 };
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
      const cast: CastCommand = { ...base, ...queue, type: "cast", unitId: unitId + 0, abilityId };
      if (targetId !== undefined) cast.targetId = targetId + 0;
      return cast;
    }
    case "concede":
      return { ...base, type: "concede" };
    default:
      return null;
  }
}

/**
 * Commands for one tick in player order, so every device that holds the same
 * commands applies them the same way, whatever order they arrived in. A
 * player's own commands keep the order that player sent them.
 */
export function inSeatOrder(world: World, commands: readonly Command[]): Command[] {
  const seat = new Map(world.players.map((player, index) => [player.id, index]));
  const seatOf = (command: Command) => seat.get(command.playerId) ?? world.players.length;
  // `sort` is stable, so each player's commands keep their order.
  return [...commands].sort((a, b) => seatOf(a) - seatOf(b));
}

/**
 * Holds commands until their tick, outside the world, so commands that have
 * arrived early never change a save or a hash. Lives with whoever runs `step`.
 */
export interface CommandQueue {
  /**
   * Holds a command for its tick. Refuses a malformed one, one for a tick
   * before `currentTick`, one further ahead than `COMMAND_HORIZON`, and one past
   * the player's `MAX_COMMANDS_PER_TICK`. `currentTick` is the match's tick,
   * which is the local world's on a single device.
   */
  add(command: Command, currentTick: number): boolean;
  /** Removes and returns the commands for a tick, in the order they were added. */
  take(tick: number): Command[];
}

export function createCommandQueue(): CommandQueue {
  const byTick = new Map<number, Command[]>();
  return {
    add(command, currentTick) {
      const clean = normalizeCommand(command);
      if (clean === null) return false;
      if (clean.tick < currentTick || clean.tick > currentTick + COMMAND_HORIZON) return false;
      const held = byTick.get(clean.tick);
      if (held === undefined) {
        byTick.set(clean.tick, [clean]);
        return true;
      }
      const sent = held.filter((other) => other.playerId === clean.playerId).length;
      if (sent >= MAX_COMMANDS_PER_TICK) return false;
      held.push(clean);
      return true;
    },
    take(tick) {
      const held = byTick.get(tick) ?? [];
      byTick.delete(tick);
      return held;
    },
  };
}

/** The player's mobile units among `ids`, in id order. */
function ownUnits(world: World, playerId: string, ids: readonly number[]): Entity[] {
  const named = new Set(ids);
  return world.entities.filter(
    (entity) =>
      entity.playerId === playerId &&
      named.has(entity.id) &&
      definitionOf(world, entity).speed !== undefined,
  );
}

/**
 * Replaces the entity's orders, or adds one after them when `queued`. A queued
 * order is dropped when the queue is full or ends in a hold or patrol, which
 * last until replaced, so it would never start.
 */
function giveOrder(entity: Entity, order: Order, queued = false): void {
  const last = entity.orders[entity.orders.length - 1];
  if (queued && last !== undefined) {
    const lasting = last.type === "hold" || last.type === "patrol";
    if (!lasting && entity.orders.length < MAX_ORDERS) entity.orders.push(order);
    return;
  }
  entity.orders = [order];
  entity.path = [];
  entity.pathGoal = null;
}

/** Spots around a point, one per unit in a square grid, so a group does not stack. */
function formation(world: World, units: Entity[], x: number, y: number): Point[] {
  const columns = Math.ceil(Math.sqrt(units.length));
  const rows = Math.ceil(units.length / columns);
  let spacing = 0;
  for (const unit of units) {
    spacing = Math.max(spacing, definitionOf(world, unit).radius * 2 + 0.4);
  }
  return units.map((_, index) => {
    const column = index % columns;
    const row = (index - column) / columns;
    return {
      x: clamp(x + (column - (columns - 1) / 2) * spacing, 0, world.map.width),
      y: clamp(y + (row - (rows - 1) / 2) * spacing, 0, world.map.height),
    };
  });
}

export function applyCommand(world: World, command: Command, events: SimEvent[]): void {
  const player = findPlayer(world, command.playerId);
  // A `none` player is moved only by triggers.
  if (player === undefined || player.defeated || player.controller === "none") return;
  if (command.type === "concede") {
    defeatPlayer(world, player.id, events);
    return;
  }
  if (world.commandRules.length > 0) {
    const refused = refusedCommands(world);
    if (refused.includes(command.type)) return;
    // An attack-move moves, so a rule that keeps units still refuses it too.
    const attackMove = command.type === "attack" && command.targetId === undefined;
    if (attackMove && refused.includes("move")) return;
  }

  switch (command.type) {
    case "move": {
      const units = ownUnits(world, player.id, command.unitIds);
      const spots = formation(world, units, command.x, command.y);
      units.forEach((unit, index) => {
        giveOrder(unit, { type: "move", ...spots[index] }, command.queued);
      });
      return;
    }
    case "attack": {
      if (command.targetId === undefined) {
        const units = ownUnits(world, player.id, command.unitIds);
        const spots = formation(world, units, command.x!, command.y!);
        units.forEach((unit, index) => {
          giveOrder(unit, { type: "attackMove", ...spots[index] }, command.queued);
        });
        return;
      }
      const target = findEntity(world, command.targetId);
      if (target === undefined) return;
      for (const unit of ownUnits(world, player.id, command.unitIds)) {
        if (definitionOf(world, unit).weapon !== undefined && isEnemy(world, unit, target)) {
          giveOrder(unit, { type: "attack", targetId: target.id }, command.queued);
        }
      }
      return;
    }
    case "patrol": {
      const units = ownUnits(world, player.id, command.unitIds);
      const spots = formation(world, units, command.x, command.y);
      units.forEach((unit, index) => {
        // A queued patrol after another adds a point to that loop.
        const last = unit.orders[unit.orders.length - 1];
        if (command.queued === true && last?.type === "patrol") {
          if (last.points.length < MAX_ORDERS) last.points.push(spots[index]);
        } else
          giveOrder(unit, { type: "patrol", points: [spots[index]], next: -1 }, command.queued);
      });
      return;
    }
    case "hold":
      for (const unit of ownUnits(world, player.id, command.unitIds)) {
        giveOrder(unit, { type: "hold" }, command.queued);
      }
      return;
    case "stop":
      for (const unit of ownUnits(world, player.id, command.unitIds)) {
        unit.orders = [];
        unit.path = [];
        unit.pathGoal = null;
      }
      return;
    case "gather": {
      const node = findEntity(world, command.nodeId);
      if (node === undefined || definitionOf(world, node).resource === undefined) return;
      for (const unit of ownUnits(world, player.id, command.unitIds)) {
        if (definitionOf(world, unit).gatherer !== undefined) {
          giveOrder(
            unit,
            { type: "gather", nodeId: node.id, returning: false, progress: 0 },
            command.queued,
          );
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
        giveOrder(builder, { type: "build", buildingId: building.id }, command.queued);
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
          giveOrder(unit, { type: "build", buildingId: building.id }, command.queued);
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
      giveOrder(unit, { type: "cast", ability: index, targetId: target.id }, command.queued);
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
