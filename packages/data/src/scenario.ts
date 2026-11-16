import { z } from "zod";

export const FORMAT_VERSION = 1;

/** Starts with a letter, so an id is never a special object key such as `__proto__`. */
const idSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
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
    controller: z.enum(["human", "ai"]),
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

/** A player who no longer meets the condition is defeated. The last one standing wins. */
export const victorySchema = z.discriminatedUnion("type", [
  /** Keep anything that has health. */
  z.object({ type: z.literal("destroyAll") }),
  /** Keep at least one entity of the listed definitions. */
  z.object({ type: z.literal("destroyDefinitions"), definitionIds: z.array(idSchema).min(1) }),
]);

export const scenarioSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    map: z.object({ width: positive, height: positive }),
    players: z.array(playerSchema),
    definitions: z.array(definitionSchema),
    placements: z.array(placementSchema),
    victory: victorySchema,
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
    if (scenario.victory.type === "destroyDefinitions") {
      scenario.victory.definitionIds.forEach((id, i) =>
        requireDefinition(id, ["victory", "definitionIds", i]),
      );
    }
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
  });

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
export type Victory = z.infer<typeof victorySchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
