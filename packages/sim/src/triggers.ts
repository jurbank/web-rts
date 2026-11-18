import { invalidateSight, revealRegion, seesEntity } from "./fog.ts";
import {
  COMMAND_TYPES,
  TRIGGERING,
  type Action,
  type CommandType,
  type Condition,
  type Trigger,
  type TriggerEvent,
} from "data";
import {
  addModifier,
  bringBack,
  defeatPlayer,
  endGame,
  gainExperience,
  rollOffers,
  sendHome,
  type SimEvent,
} from "./systems.ts";
import {
  definitionOf,
  teamOf,
  toTicks,
  entitiesInside,
  findEntity,
  findPlayer,
  spawn,
  type Entity,
  type World,
} from "./world.ts";

/** The entity behind a `died`, `entered`, or `leveled` event. A dead one is already gone from the world. */
interface Triggering {
  id: number;
  definitionId: string;
  playerId: string | null;
}

type Fired =
  | { type: "start" | "tick" }
  | { type: "timer"; timer: string }
  | { type: "died"; entity: Triggering }
  | { type: "entered"; region: string; entity: Triggering }
  | { type: "leveled"; level: number; entity: Triggering };

/**
 * Runs the scenario's triggers for this tick (C5). Events fire in a fixed
 * order: start, deaths, level-ups (those trigger actions caused last tick,
 * then this tick's), region entries, timers, then the tick itself. Each event
 * runs the matching triggers in scenario order. Changes made by actions are
 * seen by the triggers after them.
 */
export function runTriggers(world: World, events: SimEvent[]): void {
  const fired: Fired[] = [];
  if (world.tick === 0) fired.push({ type: "start" });
  for (const event of events) {
    if (event.type === "died") fired.push({ type: "died", entity: event });
  }
  fired.push(...levelUps(world, [...world.levelUps, ...leveled(events)]));
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

  const before = events.length;
  for (const event of fired) {
    for (const trigger of world.triggers) {
      if (world.outcome !== null) break;
      if (!matches(trigger.event, event)) continue;
      const entity = "entity" in event ? event.entity : null;
      if (trigger.conditions.every((condition) => holds(world, condition, entity))) {
        runActions(world, trigger, entity, events);
      }
    }
  }
  world.levelUps = leveled(events.slice(before));
}

function leveled(events: readonly SimEvent[]): World["levelUps"] {
  return events.flatMap((event) =>
    event.type === "leveled" ? [{ id: event.id, level: event.level }] : [],
  );
}

/** Level-ups of entities still in the world, as events to fire. */
function levelUps(world: World, ups: World["levelUps"]): Fired[] {
  return ups.flatMap(({ id, level }): Fired[] => {
    const entity = findEntity(world, id);
    return entity === undefined ? [] : [{ type: "leveled", level, entity: triggering(entity) }];
  });
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
    case "entered":
    case "leveled": {
      if (event.type !== wanted.type) return false;
      if (event.type === "entered" && wanted.type === "entered" && event.region !== wanted.region) {
        return false;
      }
      if (event.type === "leveled" && wanted.type === "leveled") {
        if (wanted.level !== undefined && event.level !== wanted.level) return false;
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

/** The command types a command rule refuses now, in the order rules list them. */
export function refusedCommands(world: World): CommandType[] {
  const refused: CommandType[] = [];
  for (const rule of world.commandRules) {
    if (rule.conditions.every((condition) => holds(world, condition, null))) continue;
    for (const type of rule.commands ?? COMMAND_TYPES) {
      if (!refused.includes(type)) refused.push(type);
    }
  }
  return refused;
}

function holds(world: World, condition: Condition, entity: Triggering | null): boolean {
  switch (condition.type) {
    case "variable":
      return compare(world.variables[condition.variable], condition.op, condition.value);
    case "visible": {
      const viewer = resolvePlayer(condition.viewer, entity);
      if (viewer === null) return false;
      const matches = selects(condition, entity);
      return world.entities.some((other) => matches(other) && seesEntity(world, viewer, other));
    }
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

/** Whether an entity matches every field of an action's selection. */
function selects(
  selection:
    | Extract<Condition, { type: "visible" }>
    | Extract<
        Action,
        { type: "modify" | "walk" | "setHome" | "returnHome" | "rollOffers" | "grantExperience" }
      >,
  entity: Triggering | null,
): (candidate: Entity) => boolean {
  const { definitionIds } = selection;
  const playerId =
    selection.playerId === undefined ? undefined : resolvePlayer(selection.playerId, entity);
  return (candidate) =>
    (selection.entity === undefined || candidate.id === entity?.id) &&
    (playerId === undefined || candidate.playerId === playerId) &&
    (definitionIds === undefined || definitionIds.includes(candidate.definitionId));
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
    invalidateSight(world);
  }
}

function runAction(
  world: World,
  action: Action,
  entity: Triggering | null,
  events: SimEvent[],
): void {
  switch (action.type) {
    case "reveal": {
      const team = teamOf(world, resolvePlayer(action.playerId, entity));
      if (team !== null) revealRegion(world, team, action.region, toTicks(action.seconds));
      return;
    }
    case "setVariable":
      world.variables[action.variable] = action.value;
      return;
    case "addVariable":
      world.variables[action.variable] += action.value;
      return;
    case "startTimer":
    case "stopTimer": {
      const timer = world.timers.find((candidate) => candidate.id === action.timer)!;
      timer.remaining = action.type === "startTimer" ? timer.period : null;
      return;
    }
    case "modify": {
      for (const selected of world.entities.filter(selects(action, entity))) {
        addModifier(selected, action);
      }
      return;
    }
    case "walk":
      for (const selected of world.entities.filter(selects(action, entity))) {
        if (definitionOf(world, selected).speed === undefined) continue;
        selected.orders = [{ type: "path", pathId: action.path, next: 0 }];
        selected.path = [];
        selected.pathGoal = null;
      }
      return;
    case "setHome":
      for (const selected of world.entities.filter(selects(action, entity))) {
        selected.home = { x: selected.x, y: selected.y };
      }
      return;
    case "returnHome": {
      const accept = selects(action, entity);
      for (const selected of world.entities.filter(accept)) sendHome(world, selected);
      bringBack(world, (waiting) => accept(waiting.entity), events);
      return;
    }
    case "rollOffers":
      for (const selected of world.entities.filter(selects(action, entity))) {
        rollOffers(world, selected);
      }
      return;
    case "grantExperience":
      for (const selected of world.entities.filter(selects(action, entity))) {
        gainExperience(world, selected, action.amount, events);
      }
      return;
    case "spawn": {
      const playerId = action.playerId === null ? null : resolvePlayer(action.playerId, entity);
      const at = world.waypoints[action.at];
      for (let i = 0; i < action.count; i++) {
        const spawned = spawn(world, action.definitionId, playerId, at.x, at.y);
        if (action.path !== undefined && definitionOf(world, spawned).speed !== undefined) {
          spawned.orders = [{ type: "path", pathId: action.path, next: 0 }];
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
      const team = winnerId === null ? undefined : findPlayer(world, winnerId)?.team;
      if (team === undefined) return;
      for (const player of world.players) {
        if (player.team !== team) defeatPlayer(world, player.id, events);
      }
      endGame(world, team, events);
      return;
    }
  }
}
