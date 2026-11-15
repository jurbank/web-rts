import { z } from "zod";

export const FORMAT_VERSION = 1;

/** Starts with a letter, so an id is never a special object key such as `__proto__`. */
const idSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

export const unitDefinitionSchema = z.object({
  id: idSchema,
  speed: z.number().positive(),
});

export const playerSchema = z.object({
  id: idSchema,
});

export const placementSchema = z.object({
  definitionId: idSchema,
  playerId: idSchema,
  x: z.number(),
  y: z.number(),
});

export const scenarioSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    map: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    players: z.array(playerSchema),
    unitDefinitions: z.array(unitDefinitionSchema),
    placements: z.array(placementSchema),
  })
  .superRefine((scenario, ctx) => {
    const playerIds = uniqueIds(scenario.players, "players", ctx);
    const definitionIds = uniqueIds(scenario.unitDefinitions, "unitDefinitions", ctx);
    scenario.placements.forEach((placement, index) => {
      const path = ["placements", index];
      if (!playerIds.has(placement.playerId)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown player "${placement.playerId}"`,
          path: [...path, "playerId"],
        });
      }
      if (!definitionIds.has(placement.definitionId)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown unit definition "${placement.definitionId}"`,
          path: [...path, "definitionId"],
        });
      }
      const inside =
        placement.x >= 0 &&
        placement.x <= scenario.map.width &&
        placement.y >= 0 &&
        placement.y <= scenario.map.height;
      if (!inside) {
        ctx.addIssue({ code: "custom", message: "Placement is outside the map", path });
      }
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

export type UnitDefinition = z.infer<typeof unitDefinitionSchema>;
export type Player = z.infer<typeof playerSchema>;
export type Placement = z.infer<typeof placementSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
