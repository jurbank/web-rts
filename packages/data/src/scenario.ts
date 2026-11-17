import { z } from "zod";
import {
  idSchema,
  pathSchema,
  regionSchema,
  timerSchema,
  triggerSchema,
  TRIGGERING,
  variableSchema,
  waypointSchema,
  type Trigger,
} from "./triggers.ts";

export const FORMAT_VERSION = 2;
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const positive = z.number().positive();

/** Distances are ground units. Durations are seconds and speeds are per second (C7). */
export const definitionSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  /** Footprint radius. */
  radius: positive,
  /** Overrides the owner's color. Neutral entities need one. */
  color: colorSchema.optional(),
  /** Absent means it cannot be damaged. */
  maxHealth: positive.optional(),
  /** Absent means it never moves and blocks movement. */
  speed: positive.optional(),
  weapon: z
    .object({
      damage: positive,
      /** Measured to the target's edge. */
      range: positive,
      cooldown: positive,
      /** How far an idle unit looks for a target. Defaults to `range`. */
      acquireRange: positive.optional(),
    })
    .optional(),
  gatherer: z.object({ capacity: positive, gatherTime: positive }).optional(),
  resource: z.object({ amount: positive }).optional(),
  /** Gatherers deliver resources here. */
  dropOff: z.boolean().default(false),
  cost: z.number().nonnegative().default(0),
  /** Time to construct or produce one. */
  buildTime: positive.default(1),
  /** Definitions this building trains. */
  produces: z.array(idSchema).default([]),
  /** How many units may wait in this building's queue. */
  queueLimit: z.int().positive().default(5),
  /** Definitions this unit constructs. */
  builds: z.array(idSchema).default([]),
});

export const playerSchema = z
  .object({
    id: idSchema,
    color: colorSchema,
    /** Nobody commands a `none` player. Only triggers act for it. */
    controller: z.enum(["human", "ai", "none"]),
    resources: z.number().nonnegative().default(0),
    /** Where this player's view begins. Defaults to something they own. */
    start: z.object({ x: z.number(), y: z.number() }).optional(),
    ai: z
      .object({
        /** Gatherers to keep before spending on anything else. */
        workers: z.int().nonnegative(),
        /** Idle armed units to collect before sending them out. */
        attackSize: z.int().positive(),
      })
      .optional(),
  })
  .refine((player) => player.controller !== "ai" || player.ai !== undefined, {
    message: "An ai player needs ai settings",
    path: ["ai"],
  });

export const placementSchema = z.object({
  definitionId: idSchema,
  /** Null for neutral entities such as obstacles and resources. */
  playerId: idSchema.nullable().default(null),
  x: z.number(),
  y: z.number(),
});

export const scenarioSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    map: z.object({ width: positive, height: positive }),
    players: z.array(playerSchema),
    definitions: z.array(definitionSchema),
    placements: z.array(placementSchema),
    variables: z.array(variableSchema).default([]),
    timers: z.array(timerSchema).default([]),
    regions: z.array(regionSchema).default([]),
    waypoints: z.array(waypointSchema).default([]),
    paths: z.array(pathSchema).default([]),
    /** Scenario logic, including how the game is won and lost (C5, C6). */
    triggers: z.array(triggerSchema).default([]),
  })
  .superRefine((scenario, ctx) => {
    const playerIds = uniqueIds(scenario.players, "players", ctx);
    const definitionIds = uniqueIds(scenario.definitions, "definitions", ctx);
    const requireDefinition = (id: string, path: PropertyKey[]) => {
      if (!definitionIds.has(id)) {
        ctx.addIssue({ code: "custom", message: `Unknown definition "${id}"`, path });
      }
    };

    const requireInside = (point: { x: number; y: number }, what: string, path: PropertyKey[]) => {
      const inside =
        point.x >= 0 &&
        point.x <= scenario.map.width &&
        point.y >= 0 &&
        point.y <= scenario.map.height;
      if (!inside) ctx.addIssue({ code: "custom", message: `${what} is outside the map`, path });
    };

    scenario.players.forEach((player, index) => {
      if (player.start !== undefined) {
        requireInside(player.start, "Start point", ["players", index, "start"]);
      }
    });
    scenario.definitions.forEach((definition, index) => {
      definition.produces.forEach((id, i) =>
        requireDefinition(id, ["definitions", index, "produces", i]),
      );
      definition.builds.forEach((id, i) =>
        requireDefinition(id, ["definitions", index, "builds", i]),
      );
    });
    scenario.placements.forEach((placement, index) => {
      const path = ["placements", index];
      if (placement.playerId !== null && !playerIds.has(placement.playerId)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown player "${placement.playerId}"`,
          path: [...path, "playerId"],
        });
      }
      requireDefinition(placement.definitionId, [...path, "definitionId"]);
      requireInside(placement, "Placement", path);
    });

    const requireIn = (ids: Set<string>, what: string) => (id: string, path: PropertyKey[]) => {
      if (!ids.has(id)) ctx.addIssue({ code: "custom", message: `Unknown ${what} "${id}"`, path });
    };
    const refs: References = {
      definition: requireDefinition,
      player: requireIn(playerIds, "player"),
      variable: requireIn(uniqueIds(scenario.variables, "variables", ctx), "variable"),
      timer: requireIn(uniqueIds(scenario.timers, "timers", ctx), "timer"),
      region: requireIn(uniqueIds(scenario.regions, "regions", ctx), "region"),
      waypoint: requireIn(uniqueIds(scenario.waypoints, "waypoints", ctx), "waypoint"),
      path: requireIn(uniqueIds(scenario.paths, "paths", ctx), "path"),
    };
    uniqueIds(scenario.triggers, "triggers", ctx);

    scenario.regions.forEach((region, index) => {
      const far = { x: region.x + region.width, y: region.y + region.height };
      requireInside(region, "Region", ["regions", index]);
      requireInside(far, "Region", ["regions", index]);
    });
    scenario.waypoints.forEach((waypoint, index) =>
      requireInside(waypoint, "Waypoint", ["waypoints", index]),
    );
    scenario.paths.forEach((path, index) =>
      path.waypoints.forEach((id, i) => refs.waypoint(id, ["paths", index, "waypoints", i])),
    );
    scenario.triggers.forEach((trigger, index) =>
      checkTrigger(trigger, ["triggers", index], refs, ctx),
    );
  });

type Check = (id: string, path: PropertyKey[]) => void;

interface References {
  definition: Check;
  player: Check;
  variable: Check;
  timer: Check;
  region: Check;
  waypoint: Check;
  path: Check;
}

/** Reports every reference that names nothing, so an author gets each exact path to fix. */
function checkTrigger(
  trigger: Trigger,
  at: PropertyKey[],
  refs: References,
  ctx: z.RefinementCtx,
): void {
  const { event } = trigger;
  const hasTriggering = event.type === "died" || event.type === "entered";
  const player = (id: string | null | undefined, path: PropertyKey[]) => {
    if (id === null || id === undefined) return;
    if (id !== TRIGGERING) refs.player(id, path);
    else if (!hasTriggering) {
      ctx.addIssue({
        code: "custom",
        message: `Only died and entered events have a triggering entity`,
        path,
      });
    }
  };
  const definitions = (ids: string[] | undefined, path: PropertyKey[]) =>
    ids?.forEach((id, i) => refs.definition(id, [...path, i]));

  const eventPath = [...at, "event"];
  if (event.type === "timer") refs.timer(event.timer, [...eventPath, "timer"]);
  if (event.type === "entered") refs.region(event.region, [...eventPath, "region"]);
  if (event.type === "died" || event.type === "entered") {
    player(event.playerId, [...eventPath, "playerId"]);
    definitions(event.definitionIds, [...eventPath, "definitionIds"]);
  }

  trigger.conditions.forEach((condition, index) => {
    const path = [...at, "conditions", index];
    if (condition.type === "variable") refs.variable(condition.variable, [...path, "variable"]);
    if (condition.type === "count") {
      player(condition.playerId, [...path, "playerId"]);
      definitions(condition.definitionIds, [...path, "definitionIds"]);
    }
  });

  trigger.actions.forEach((action, index) => {
    const path = [...at, "actions", index];
    switch (action.type) {
      case "setVariable":
      case "addVariable":
        refs.variable(action.variable, [...path, "variable"]);
        break;
      case "startTimer":
        refs.timer(action.timer, [...path, "timer"]);
        break;
      case "spawn":
        refs.definition(action.definitionId, [...path, "definitionId"]);
        player(action.playerId, [...path, "playerId"]);
        refs.waypoint(action.at, [...path, "at"]);
        if (action.path !== undefined) refs.path(action.path, [...path, "path"]);
        break;
      case "remove":
        player(action.entity, [...path, "entity"]);
        break;
      case "grantResources":
      case "defeat":
      case "win":
        player(action.playerId, [...path, "playerId"]);
        break;
    }
  });
}

function uniqueIds(
  items: readonly { id: string }[],
  key: string,
  ctx: z.RefinementCtx,
): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (ids.has(item.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate id "${item.id}"`,
        path: [key, index, "id"],
      });
    }
    ids.add(item.id);
  });
  return ids;
}

export type Definition = z.infer<typeof definitionSchema>;
export type Player = z.infer<typeof playerSchema>;
export type Placement = z.infer<typeof placementSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
