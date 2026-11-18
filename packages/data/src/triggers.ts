import { z } from "zod";

/** Starts with a letter, so an id is never a special object key such as `__proto__`. */
export const idSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

/**
 * Stands for the entity that set off a `died`, `entered`, or `leveled` event,
 * or for its owner where a player is expected. It cannot be an id, since ids
 * start with a letter.
 */
export const TRIGGERING = "$triggering";

const triggeringSchema = z.literal(TRIGGERING);
/** A player id, or the owner of the triggering entity. */
const playerRefSchema = z.union([idSchema, triggeringSchema]);
const compareSchema = z.enum(["==", "!=", "<", "<=", ">", ">="]);

/** The numbers a modifier can change. `range`, `cooldown`, and `damage` are the weapon's. */
export const statSchema = z.enum([
  "maxHealth",
  "speed",
  "damage",
  "range",
  "cooldown",
  "armor",
  "sight",
]);

/** The entities an action works on: those matching every field given. */
const selectionShape = {
  /** Only the triggering entity. */
  entity: triggeringSchema.optional(),
  playerId: playerRefSchema.optional(),
  definitionIds: z.array(idSchema).min(1).optional(),
};

/** A number the scenario keeps and triggers read and change. */
export const variableSchema = z.object({
  id: idSchema,
  value: z.number().default(0),
  /** Players see a labelled variable in the HUD. */
  label: z.string().min(1).optional(),
});

/** Counts down once started, and fires a `timer` event when it reaches zero. */
export const timerSchema = z.object({
  id: idSchema,
  seconds: z.number().positive(),
  /** Starts again each time it fires. */
  repeat: z.boolean().default(false),
  /** Players see a labelled timer's seconds left in the HUD while it runs. */
  label: z.string().min(1).optional(),
});

/** A rectangle on the ground, from its low corner. */
export const regionSchema = z.object({
  id: idSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const waypointSchema = z.object({ id: idSchema, x: z.number(), y: z.number() });

/** Waypoints visited in order. */
export const pathSchema = z.object({ id: idSchema, waypoints: z.array(idSchema).min(1) });

/** What a trigger waits for. Only `died`, `entered`, and `leveled` have a triggering entity. */
export const eventSchema = z.discriminatedUnion("type", [
  /** The first tick. */
  z.object({ type: z.literal("start") }),
  /** Every tick. */
  z.object({ type: z.literal("tick") }),
  z.object({ type: z.literal("timer"), timer: idSchema }),
  z.object({
    type: z.literal("died"),
    playerId: idSchema.optional(),
    definitionIds: z.array(idSchema).min(1).optional(),
  }),
  /** An entity moved into the region. Entities placed inside it do not count. */
  z.object({
    type: z.literal("entered"),
    region: idSchema,
    playerId: idSchema.optional(),
    definitionIds: z.array(idSchema).min(1).optional(),
  }),
  /** An entity gained a level, or reached `level` when it is given. */
  z.object({
    type: z.literal("leveled"),
    playerId: idSchema.optional(),
    definitionIds: z.array(idSchema).min(1).optional(),
    level: z.int().min(2).optional(),
  }),
]);

/** Every condition must hold for the actions to run. */
export const conditionSchema = z.discriminatedUnion("type", [
  /** The viewer's team can see at least one matching live entity. */
  z.object({ type: z.literal("visible"), viewer: playerRefSchema, ...selectionShape }),
  z.object({
    type: z.literal("variable"),
    variable: idSchema,
    op: compareSchema,
    value: z.number(),
  }),
  /** Entities matching every field given. */
  z.object({
    type: z.literal("count"),
    playerId: playerRefSchema.optional(),
    definitionIds: z.array(idSchema).min(1).optional(),
    op: compareSchema,
    value: z.number(),
  }),
]);

export const actionSchema = z.discriminatedUnion("type", [
  /** Gives the named player's team vision of a region for this duration. */
  z.object({
    type: z.literal("reveal"),
    playerId: playerRefSchema,
    region: idSchema,
    seconds: z.number().positive(),
  }),
  z.object({ type: z.literal("setVariable"), variable: idSchema, value: z.number() }),
  z.object({ type: z.literal("addVariable"), variable: idSchema, value: z.number() }),
  /** Starts the timer, or starts it over. */
  z.object({ type: z.literal("startTimer"), timer: idSchema }),
  z.object({ type: z.literal("stopTimer"), timer: idSchema }),
  z.object({
    type: z.literal("spawn"),
    definitionId: idSchema,
    /** Null for neutral entities. */
    playerId: playerRefSchema.nullable(),
    /** A waypoint. */
    at: idSchema,
    count: z.int().positive().default(1),
    /** Units that can move walk it to the end. */
    path: idSchema.optional(),
  }),
  /** Takes the entity out of the world. It does not count as dying. */
  z.object({ type: z.literal("remove"), entity: triggeringSchema }),
  /** A negative amount takes resources away, down to zero. */
  z.object({ type: z.literal("grantResources"), playerId: playerRefSchema, amount: z.number() }),
  z.object({ type: z.literal("defeat"), playerId: playerRefSchema }),
  /** Leaves a modifier on each selected entity, as an ability effect would. */
  z.object({
    type: z.literal("modify"),
    ...selectionShape,
    stat: statSchema,
    add: z.number(),
    /** Without them it lasts for life and through respawn. */
    seconds: z.number().positive().optional(),
  }),
  /** Selected units that can move walk the path, fighting what they meet. */
  z.object({ type: z.literal("walk"), ...selectionShape, path: idSchema }),
  /** Where each selected entity stands becomes where it returns to. */
  z.object({ type: z.literal("setHome"), ...selectionShape }),
  /**
   * Selected entities go back home at full health, with orders, cooldowns, and
   * timed modifiers cleared. Selected ones waiting to respawn come back now.
   */
  z.object({ type: z.literal("returnHome"), ...selectionShape }),
  /** Fills the offers of each selected entity that has them. */
  z.object({ type: z.literal("rollOffers"), ...selectionShape }),
  /** Each selected entity with levels gains this much experience, and the levels it reaches. */
  z.object({
    type: z.literal("grantExperience"),
    ...selectionShape,
    amount: z.number().positive(),
  }),
  /** Defeats every other player and ends the game. */
  z.object({ type: z.literal("win"), playerId: playerRefSchema }),
]);

/** When the event happens and every condition holds, the actions run in order (C5). */
export const triggerSchema = z.object({
  id: idSchema,
  event: eventSchema,
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
});

/** Every command type a command rule can name. */
export const COMMAND_TYPES = [
  "move",
  "attack",
  "patrol",
  "hold",
  "stop",
  "gather",
  "build",
  "assist",
  "produce",
  "research",
  "cast",
] as const;

/** Commands of the listed types, or of every type, are refused unless every condition holds. */
export const commandRuleSchema = z.object({
  commands: z.array(z.enum(COMMAND_TYPES)).min(1).optional(),
  conditions: z.array(conditionSchema).min(1),
});

export type Variable = z.infer<typeof variableSchema>;
export type Timer = z.infer<typeof timerSchema>;
export type Region = z.infer<typeof regionSchema>;
export type Waypoint = z.infer<typeof waypointSchema>;
export type Path = z.infer<typeof pathSchema>;
export type TriggerEvent = z.infer<typeof eventSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Trigger = z.infer<typeof triggerSchema>;
export type CommandRule = z.infer<typeof commandRuleSchema>;
export type CommandType = (typeof COMMAND_TYPES)[number];
