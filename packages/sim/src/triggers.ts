import { TRIGGERING, type Action, type Condition, type Trigger, type TriggerEvent } from "data";
import { defeatPlayer, endGame, type SimEvent } from "./systems.ts";
import {
  definitionOf,
  entitiesInside,
  findEntity,
  findPlayer,
  spawn,
  type Entity,
  type World,
} from "./world.ts";

/** The entity behind a `died` or `entered` event. A dead one is already gone from the world. */
interface Triggering {
  id: number;
  definitionId: string;
  playerId: string | null;
}

type Fired =
  | { type: "start" | "tick" }
  | { type: "timer"; timer: string }
  | { type: "died"; entity: Triggering }
  | { type: "entered"; region: string; entity: Triggering };

/**
 * Runs the scenario's triggers for this tick (C5). Events fire in a fixed
 * order: start, deaths, region entries, timers, then the tick itself. Each
 * event runs the matching triggers in scenario order. Changes made by actions
 * are seen by the triggers after them.
 */
export function runTriggers(world: World, events: SimEvent[]): void {
  const fired: Fired[] = [];
  if (world.tick === 0) fired.push({ type: "start" });
  for (const event of events) {
    if (event.type === "died") fired.push({ type: "died", entity: event });
  }
  for (const region of world.regions) {
    const inside = entitiesInside(world, region);
    for (const id of inside) {
      if (region.inside.includes(id)) continue;
      const entity = findEntity(world, id)!;
      fired.push({ type: "entered", region: region.id, entity: triggering(entity) });
    }
    region.inside = inside;
  }
  for (const timer of world.timers) {
    if (timer.remaining === null) continue;
    timer.remaining -= 1;
    if (timer.remaining > 0) continue;
    timer.remaining = timer.repeat ? timer.period : null;
    fired.push({ type: "timer", timer: timer.id });
  }
  fired.push({ type: "tick" });

  for (const event of fired) {
    for (const trigger of world.triggers) {
      if (world.outcome !== null) return;
      if (!matches(trigger.event, event)) continue;
      const entity = "entity" in event ? event.entity : null;
      if (trigger.conditions.every((condition) => holds(world, condition, entity))) {
        runActions(world, trigger, entity, events);
      }
    }
  }
}

function triggering(entity: Entity): Triggering {
  return { id: entity.id, definitionId: entity.definitionId, playerId: entity.playerId };
}

function matches(wanted: TriggerEvent, event: Fired): boolean {
  switch (wanted.type) {
    case "start":
    case "tick":
      return event.type === wanted.type;
    case "timer":
      return event.type === "timer" && event.timer === wanted.timer;
    case "died":
    case "entered": {
      if (event.type !== wanted.type) return false;
      if (event.type === "entered" && wanted.type === "entered" && event.region !== wanted.region) {
        return false;
      }
      const { playerId, definitionIds } = wanted;
      return (
        (playerId === undefined || event.entity.playerId === playerId) &&
        (definitionIds === undefined || definitionIds.includes(event.entity.definitionId))
      );
    }
  }
}

/** A player id from trigger data. The triggering entity's owner may be nobody. */
function resolvePlayer(id: string, entity: Triggering | null): string | null {
  return id === TRIGGERING ? (entity?.playerId ?? null) : id;
}

function compare(left: number, op: Extract<Condition, { op: unknown }>["op"], right: number) {
  switch (op) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}

function holds(world: World, condition: Condition, entity: Triggering | null): boolean {
  switch (condition.type) {
    case "variable":
      return compare(world.variables[condition.variable], condition.op, condition.value);
    case "count": {
      const { definitionIds } = condition;
      const playerId =
        condition.playerId === undefined ? undefined : resolvePlayer(condition.playerId, entity);
      let count = 0;
      for (const other of world.entities) {
        if (playerId !== undefined && other.playerId !== playerId) continue;
        if (definitionIds !== undefined && !definitionIds.includes(other.definitionId)) continue;
        count += 1;
      }
      return compare(count, condition.op, condition.value);
    }
  }
}

function runActions(
  world: World,
  trigger: Trigger,
  entity: Triggering | null,
  events: SimEvent[],
): void {
  for (const action of trigger.actions) {
    if (world.outcome !== null) return;
    runAction(world, action, entity, events);
  }
}

function runAction(
  world: World,
  action: Action,
  entity: Triggering | null,
  events: SimEvent[],
): void {
  switch (action.type) {
    case "setVariable":
      world.variables[action.variable] = action.value;
      return;
    case "addVariable":
      world.variables[action.variable] += action.value;
      return;
    case "startTimer": {
      const timer = world.timers.find((candidate) => candidate.id === action.timer)!;
      timer.remaining = timer.period;
      return;
    }
    case "spawn": {
      const playerId = action.playerId === null ? null : resolvePlayer(action.playerId, entity);
      const at = world.waypoints[action.at];
      for (let i = 0; i < action.count; i++) {
        const spawned = spawn(world, action.definitionId, playerId, at.x, at.y);
        if (action.path !== undefined && definitionOf(world, spawned).speed !== undefined) {
          spawned.order = { type: "path", pathId: action.path, next: 0 };
        }
      }
      return;
    }
    case "remove":
      if (entity !== null) {
        world.entities = world.entities.filter((other) => other.id !== entity.id);
      }
      return;
    case "grantResources": {
      const playerId = resolvePlayer(action.playerId, entity);
      const player = playerId === null ? undefined : findPlayer(world, playerId);
      if (player !== undefined) player.resources = Math.max(0, player.resources + action.amount);
      return;
    }
    case "defeat": {
      const playerId = resolvePlayer(action.playerId, entity);
      if (playerId !== null) defeatPlayer(world, playerId, events);
      return;
    }
    case "win": {
      const winnerId = resolvePlayer(action.playerId, entity);
      if (winnerId === null) return;
      for (const player of world.players) {
        if (player.id !== winnerId) defeatPlayer(world, player.id, events);
      }
      endGame(world, winnerId, events);
      return;
    }
  }
}
