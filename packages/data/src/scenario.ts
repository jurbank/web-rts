import { z } from "zod";
import {
  commandRuleSchema,
  idSchema,
  pathSchema,
  regionSchema,
  statSchema,
  timerSchema,
  triggerSchema,
  TRIGGERING,
  variableSchema,
  waypointSchema,
  type Condition,
  type Trigger,
} from "./triggers.ts";

export const FORMAT_VERSION = 12;
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const positive = z.number().positive();

/**
 * A change to one of an entity's numbers. Every `add` is summed onto what the
 * definition says, and then every `multiply` scales the total.
 */
export const modifierSchema = z.object({
  stat: statSchema,
  add: z.number().default(0),
  multiply: positive.optional(),
});

/** Something a player must have before they can use what carries it. */
export const requirementSchema = z.discriminatedUnion("type", [
  /** The upgrade researched to at least `level`. */
  z.object({
    type: z.literal("upgrade"),
    upgrade: idSchema,
    level: z.int().positive().default(1),
  }),
  /** At least `count` finished entities of these definitions. */
  z.object({
    type: z.literal("owns"),
    definitionIds: z.array(idSchema).min(1),
    count: z.int().positive().default(1),
  }),
]);

/**
 * Researched by a player in a building, and applied to every entity of theirs
 * it names, including ones made later. Each level applies the modifiers once more.
 */
export const upgradeSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  /** Paid for each level, when research starts. */
  cost: z.number().nonnegative().default(0),
  /** Seconds each level takes. */
  researchTime: positive.default(1),
  levels: z.int().positive().default(1),
  /** The entities it changes: those of these definitions, or with any of these tags. */
  definitionIds: z.array(idSchema).default([]),
  tags: z.array(idSchema).default([]),
  modifiers: z.array(modifierSchema).min(1),
  requires: z.array(requirementSchema).default([]),
});

/** What an ability does to the entity it lands on. */
export const effectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("damage"), amount: positive }),
  /** A modifier that wears off after `seconds`, or without them lasts for life and through respawn. */
  z.object({ type: z.literal("modify"), ...modifierSchema.shape, seconds: positive.optional() }),
  /** Fills the offers of the entity it lands on. */
  z.object({ type: z.literal("rollOffers") }),
  /** Gives the entity it lands on experience, if it has levels. */
  z.object({ type: z.literal("experience"), amount: positive }),
]);

export const abilitySchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    cooldown: positive,
    /** Who the effects land on: the caster, or an enemy the caster walks into `range` of. */
    target: z.enum(["self", "enemy"]),
    /** Measured to the target's edge. */
    range: positive.optional(),
    /** The level the caster needs. */
    level: z.int().positive().default(1),
    /** Resources the owner pays when the effects land. */
    cost: z.number().nonnegative().default(0),
    /** Usable only while one of these, on the caster's team, is within `range`, edge to edge. */
    near: z.object({ definitionIds: z.array(idSchema).min(1), range: positive }).optional(),
    requires: z.array(requirementSchema).default([]),
    effects: z.array(effectSchema).min(1),
  })
  .refine((ability) => ability.target !== "enemy" || ability.range !== undefined, {
    message: "An ability that targets an enemy needs a range",
    path: ["range"],
  });

/** Distances are ground units. Durations are seconds and speeds are per second (C7). */
export const definitionSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  /** Footprint radius. */
  radius: positive,
  /** Overrides the owner's color. Neutral entities need one. */
  color: colorSchema.optional(),
  /**
   * A kind of look, such as `soldier` or `tower`, that the owner's faction draws
   * its own way. It names no model, so a scenario works with any faction.
   */
  look: idSchema.optional(),
  /** Absent means it cannot be damaged. */
  maxHealth: positive.optional(),
  /** Ground units of team vision when fog of war is enabled. */
  sight: z.number().nonnegative().optional(),
  /** Taken off each weapon hit, down to half a point. Ability damage ignores it. */
  armor: z.number().nonnegative().default(0),
  /** Names that upgrades and requirements use to mean a kind of thing, such as `infantry`. */
  tags: z.array(idSchema).default([]),
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
      /**
       * A kind of shot, such as `bullet`, `laser`, or `flame`, that the
       * attacker's faction draws its own way. It names no art and changes no
       * rule. Absent draws a generic shot for the weapon's range.
       */
      shot: idSchema.optional(),
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
  /** Upgrades this building researches. */
  researches: z.array(idSchema).default([]),
  /** What a player needs before they can train or build one. */
  requires: z.array(requirementSchema).default([]),
  /** Experience its death gives each enemy that has levels and is near enough. */
  experience: z.number().nonnegative().default(0),
  /** Resources its death gives the enemy player who dealt the last damage. */
  bounty: z.number().nonnegative().default(0),
  levels: z
    .object({
      /** Experience needed for each level after the first. Its length sets the top level. */
      thresholds: z.array(positive).min(1),
      /**
       * Who a death's experience goes to: every enemy with these levels within
       * `range`, or only the one that dealt the last damage, wherever it stands.
       * Killer credit is veterancy.
       */
      credit: z.enum(["nearby", "killer"]).default("nearby"),
      /** How far away a death still gives experience. Needed for nearby credit. */
      range: positive.optional(),
      /** Applied once for each level gained. */
      perLevel: z.array(modifierSchema).default([]),
    })
    .refine((levels) => levels.credit === "killer" || levels.range !== undefined, {
      message: "Nearby credit needs a range",
      path: ["range"],
    })
    .optional(),
  /**
   * It comes back home this long after dying, keeping its level. Without
   * `seconds` it waits for a `returnHome` action.
   */
  respawn: z.object({ seconds: positive.optional() }).optional(),
  /** Each roll fills `count` slots with draws from `definitionIds`. A `produce` command may buy one. */
  offers: z
    .object({ definitionIds: z.array(idSchema).min(1), count: z.int().positive() })
    .optional(),
  /** When one player owns `count` finished ones, they become one `into`. */
  merge: z.object({ count: z.int().min(2), into: idSchema }).optional(),
  abilities: z.array(abilitySchema).default([]),
});

export const playerSchema = z
  .object({
    id: idSchema,
    color: colorSchema,
    /** Nobody commands a `none` player. Only triggers act for it. */
    controller: z.enum(["human", "ai", "none"]),
    /** Players on the same team do not fight. Defaults to a team of their own. */
    team: idSchema.optional(),
    resources: z.number().nonnegative().default(0),
    /** The seat can't pick a faction, and takes its team's default, as a MOBA side does. */
    lockFaction: z.boolean().default(false),
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

/** The choice that is drawn from the world's seeded generator. */
export const RANDOM_CHOICE = "random";

/**
 * A choice made at match setup, such as a hero or a game mode. `player` asks
 * every seat and `match` asks once. Triggers and placements read the choices.
 */
export const optionSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  scope: z.enum(["player", "match"]),
  choices: z.array(z.object({ id: idSchema, name: z.string().min(1) })).min(1),
  /** A choice id, or `random`. Defaults to the first choice. */
  default: idSchema.optional(),
});

export const placementSchema = z.object({
  definitionId: idSchema,
  /**
   * An option whose choices are definition ids. The owner's choice, or the
   * match's, is what it starts as, and `definitionId` stands in until then.
   */
  definitionFrom: idSchema.optional(),
  /** Null for neutral entities such as obstacles and resources. */
  playerId: idSchema.nullable().default(null),
  x: z.number(),
  y: z.number(),
});

export const scenarioSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    fogOfWar: z.boolean().default(false),
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
    /** Limits on when players may give commands. */
    commandRules: z.array(commandRuleSchema).default([]),
    upgrades: z.array(upgradeSchema).default([]),
    /** Choices made at match setup. */
    options: z.array(optionSchema).default([]),
  })
  .superRefine((scenario, ctx) => {
    const playerIds = uniqueIds(scenario.players, ["players"], ctx);
    uniqueIds(scenario.options, ["options"], ctx);
    const options = new Map(scenario.options.map((option) => [option.id, option]));
    scenario.options.forEach((option, index) => {
      const choices = uniqueIds(option.choices, ["options", index, "choices"], ctx);
      if (choices.has(RANDOM_CHOICE)) {
        ctx.addIssue({
          code: "custom",
          message: `"${RANDOM_CHOICE}" means a random choice, so no choice may use it`,
          path: ["options", index, "choices"],
        });
      }
      if (option.default !== undefined && option.default !== RANDOM_CHOICE) {
        if (!choices.has(option.default)) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown choice "${option.default}"`,
            path: ["options", index, "default"],
          });
        }
      }
    });
    const definitionIds = uniqueIds(scenario.definitions, ["definitions"], ctx);
    const upgrades = new Map(scenario.upgrades.map((upgrade) => [upgrade.id, upgrade]));
    uniqueIds(scenario.upgrades, ["upgrades"], ctx);
    const requireDefinition = (id: string, path: PropertyKey[]) => {
      if (!definitionIds.has(id)) {
        ctx.addIssue({ code: "custom", message: `Unknown definition "${id}"`, path });
      }
    };
    const requireUpgrade = (id: string, path: PropertyKey[]) => {
      if (!upgrades.has(id)) {
        ctx.addIssue({ code: "custom", message: `Unknown upgrade "${id}"`, path });
      }
    };
    const checkRequirements = (requires: Requirement[], path: PropertyKey[]) =>
      requires.forEach((requirement, r) => {
        const at = [...path, "requires", r];
        if (requirement.type === "owns") {
          requirement.definitionIds.forEach((id, i) =>
            requireDefinition(id, [...at, "definitionIds", i]),
          );
          return;
        }
        const upgrade = upgrades.get(requirement.upgrade);
        if (upgrade === undefined) requireUpgrade(requirement.upgrade, [...at, "upgrade"]);
        else if (requirement.level > upgrade.levels) {
          ctx.addIssue({
            code: "custom",
            message: `"${upgrade.id}" has only ${upgrade.levels} levels`,
            path: [...at, "level"],
          });
        }
      });
    scenario.upgrades.forEach((upgrade, index) => {
      upgrade.definitionIds.forEach((id, i) =>
        requireDefinition(id, ["upgrades", index, "definitionIds", i]),
      );
      checkRequirements(upgrade.requires, ["upgrades", index]);
    });

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
      definition.researches.forEach((id, i) =>
        requireUpgrade(id, ["definitions", index, "researches", i]),
      );
      checkRequirements(definition.requires, ["definitions", index]);
      definition.abilities.forEach((ability, a) =>
        checkRequirements(ability.requires, ["definitions", index, "abilities", a]),
      );
      uniqueIds(definition.abilities, ["definitions", index, "abilities"], ctx);
      definition.abilities.forEach((ability, a) =>
        ability.near?.definitionIds.forEach((id, i) =>
          requireDefinition(id, ["definitions", index, "abilities", a, "near", "definitionIds", i]),
        ),
      );
      definition.offers?.definitionIds.forEach((id, i) =>
        requireDefinition(id, ["definitions", index, "offers", "definitionIds", i]),
      );
      if (definition.merge !== undefined) {
        requireDefinition(definition.merge.into, ["definitions", index, "merge", "into"]);
      }
      if (definition.respawn !== undefined && definition.maxHealth === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Only something that can be damaged can respawn",
          path: ["definitions", index, "respawn"],
        });
      }
    });
    const requireIn = (ids: Set<string>, what: string) => (id: string, path: PropertyKey[]) => {
      if (!ids.has(id)) ctx.addIssue({ code: "custom", message: `Unknown ${what} "${id}"`, path });
    };
    const refs: References = {
      definition: requireDefinition,
      player: requireIn(playerIds, "player"),
      variable: requireIn(uniqueIds(scenario.variables, ["variables"], ctx), "variable"),
      timer: requireIn(uniqueIds(scenario.timers, ["timers"], ctx), "timer"),
      region: requireIn(uniqueIds(scenario.regions, ["regions"], ctx), "region"),
      waypoint: requireIn(uniqueIds(scenario.waypoints, ["waypoints"], ctx), "waypoint"),
      path: requireIn(uniqueIds(scenario.paths, ["paths"], ctx), "path"),
      option: (id, path) => {
        const option = options.get(id);
        if (option === undefined) {
          ctx.addIssue({ code: "custom", message: `Unknown option "${id}"`, path });
        }
        return option;
      },
      definitionOption: (id, playerId, path) => {
        const option = refs.option(id, path);
        if (option === undefined) return;
        option.choices.forEach((choice) => requireDefinition(choice.id, path));
        if (option.scope === "player" && playerId === null) {
          ctx.addIssue({
            code: "custom",
            message: `"${id}" is chosen by each player, so something neutral can't use it`,
            path,
          });
        }
      },
    };
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
      if (placement.definitionFrom !== undefined) {
        refs.definitionOption(placement.definitionFrom, placement.playerId, [
          ...path,
          "definitionFrom",
        ]);
      }
    });

    uniqueIds(scenario.triggers, ["triggers"], ctx);

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
    scenario.commandRules.forEach((rule, index) =>
      rule.conditions.forEach((condition, i) =>
        checkCondition(condition, ["commandRules", index, "conditions", i], refs, ctx, false),
      ),
    );
  });

type Check = (id: string, path: PropertyKey[]) => void;

interface References {
  definition: Check;
  option: (id: string, path: PropertyKey[]) => Option | undefined;
  /** An option whose choices must be definitions, used for an owner that may be neutral. */
  definitionOption: (id: string, playerId: string | null, path: PropertyKey[]) => void;
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
  const hasTriggering =
    event.type === "died" || event.type === "entered" || event.type === "leveled";
  const player = playerCheck(refs, ctx, hasTriggering);
  const definitions = (ids: string[] | undefined, path: PropertyKey[]) =>
    ids?.forEach((id, i) => refs.definition(id, [...path, i]));

  const eventPath = [...at, "event"];
  if (event.type === "timer") refs.timer(event.timer, [...eventPath, "timer"]);
  if (event.type === "entered") refs.region(event.region, [...eventPath, "region"]);
  if (event.type === "died" || event.type === "entered" || event.type === "leveled") {
    player(event.playerId, [...eventPath, "playerId"]);
    definitions(event.definitionIds, [...eventPath, "definitionIds"]);
  }

  trigger.conditions.forEach((condition, index) =>
    checkCondition(condition, [...at, "conditions", index], refs, ctx, hasTriggering),
  );

  trigger.actions.forEach((action, index) => {
    const path = [...at, "actions", index];
    switch (action.type) {
      case "setVariable":
      case "addVariable":
        refs.variable(action.variable, [...path, "variable"]);
        break;
      case "reveal":
        player(action.playerId, [...path, "playerId"]);
        refs.region(action.region, [...path, "region"]);
        break;
      case "startTimer":
      case "stopTimer":
        refs.timer(action.timer, [...path, "timer"]);
        break;
      case "modify":
      case "walk":
      case "setHome":
      case "returnHome":
      case "rollOffers":
      case "grantExperience":
        player(action.entity, [...path, "entity"]);
        player(action.playerId, [...path, "playerId"]);
        definitions(action.definitionIds, [...path, "definitionIds"]);
        if (action.type === "walk") refs.path(action.path, [...path, "path"]);
        break;
      case "spawn":
        refs.definition(action.definitionId, [...path, "definitionId"]);
        player(action.playerId, [...path, "playerId"]);
        if (action.definitionFrom !== undefined) {
          refs.definitionOption(action.definitionFrom, action.playerId, [
            ...path,
            "definitionFrom",
          ]);
        }
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

/** Checks a player reference, which may be `$triggering` only where there is a triggering entity. */
function playerCheck(refs: References, ctx: z.RefinementCtx, hasTriggering: boolean) {
  return (id: string | null | undefined, path: PropertyKey[]) => {
    if (id === null || id === undefined) return;
    if (id !== TRIGGERING) refs.player(id, path);
    else if (!hasTriggering) {
      ctx.addIssue({
        code: "custom",
        message: `Only died, entered, and leveled events have a triggering entity`,
        path,
      });
    }
  };
}

function checkCondition(
  condition: Condition,
  path: PropertyKey[],
  refs: References,
  ctx: z.RefinementCtx,
  hasTriggering: boolean,
): void {
  if (condition.type === "variable") refs.variable(condition.variable, [...path, "variable"]);
  if (condition.type === "option") {
    const option = refs.option(condition.option, [...path, "option"]);
    playerCheck(refs, ctx, hasTriggering)(condition.playerId, [...path, "playerId"]);
    if (option !== undefined && !option.choices.some((choice) => choice.id === condition.choice)) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown choice "${condition.choice}"`,
        path: [...path, "choice"],
      });
    }
    if (option?.scope === "player" && condition.playerId === undefined) {
      ctx.addIssue({
        code: "custom",
        message: `"${option.id}" is chosen by each player, so name whose choice`,
        path: [...path, "playerId"],
      });
    }
  }
  if (condition.type === "visible") {
    const check = playerCheck(refs, ctx, hasTriggering);
    check(condition.viewer, [...path, "viewer"]);
    check(condition.entity, [...path, "entity"]);
  }
  if (condition.type === "count" || condition.type === "visible") {
    playerCheck(refs, ctx, hasTriggering)(condition.playerId, [...path, "playerId"]);
    condition.definitionIds?.forEach((id, i) => refs.definition(id, [...path, "definitionIds", i]));
  }
}

function uniqueIds(
  items: readonly { id: string }[],
  at: PropertyKey[],
  ctx: z.RefinementCtx,
): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (ids.has(item.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate id "${item.id}"`,
        path: [...at, index, "id"],
      });
    }
    ids.add(item.id);
  });
  return ids;
}

export type Modifier = z.infer<typeof modifierSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Upgrade = z.infer<typeof upgradeSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type Ability = z.infer<typeof abilitySchema>;
export type Definition = z.infer<typeof definitionSchema>;
export type Player = z.infer<typeof playerSchema>;
export type Placement = z.infer<typeof placementSchema>;
export type Option = z.infer<typeof optionSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
