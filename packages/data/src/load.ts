import { FORMAT_VERSION, scenarioSchema, type Scenario } from "./scenario.ts";

type Migration = (document: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version a migration reads. Each returns the next version. */
const migrations: Record<number, Migration> = {
  /**
   * Version 2 moves the victory condition into a trigger. A player is defeated
   * when an entity of theirs dies and they have none of the listed definitions
   * left, or nothing at all for `destroyAll`.
   */
  1: ({ victory, ...rest }) => {
    if (typeof victory !== "object" || victory === null) {
      throw new Error("Scenario format 1 has no victory condition");
    }
    const { type, definitionIds } = victory as { type: unknown; definitionIds?: unknown };
    const filter = type === "destroyDefinitions" ? { definitionIds } : {};
    const trigger = {
      id: "victory",
      event: { type: "died", ...filter },
      conditions: [{ type: "count", playerId: "$triggering", ...filter, op: "==", value: 0 }],
      actions: [{ type: "defeat", playerId: "$triggering" }],
    };
    return { ...rest, formatVersion: 2, triggers: [trigger] };
  },
  /** Version 3 adds teams, levels, abilities, and respawn. Every addition is optional. */
  2: (document) => ({ ...document, formatVersion: 3 }),
  /** Version 4 adds bounties, ability costs, lasting modifiers, and `near`. Every addition is optional. */
  3: (document) => ({ ...document, formatVersion: 4 }),
  /** Version 5 adds offers, merging, selections, command rules, and timer labels. Every addition is optional. */
  4: (document) => ({ ...document, formatVersion: 5 }),
  /**
   * Version 6 adds the `patrol`, `hold`, and `stop` commands. A command rule
   * that listed `move` meant to keep units still, so it now lists all three
   * too, and one that listed only `attack` also lists `patrol`.
   */
  5: ({ commandRules, ...rest }) => ({
    ...rest,
    formatVersion: 6,
    ...(Array.isArray(commandRules)
      ? {
          commandRules: commandRules.map((rule) =>
            addCommands(rule, { move: ["patrol", "hold", "stop"], attack: ["patrol"] }),
          ),
        }
      : {}),
  }),
  /**
   * Version 7 adds killer credit to levels, which is veterancy, a `leveled`
   * trigger event, a `grantExperience` action, and an `experience` effect.
   * Every addition is optional.
   */
  6: (document) => ({ ...document, formatVersion: 7 }),
  /**
   * Version 8 adds upgrades, research, requirements, tags, armor, more stats,
   * and modifiers that multiply. A command rule that refused `produce` now
   * refuses `research` too, since both spend at a building.
   */
  7: ({ commandRules, ...rest }) => ({
    ...rest,
    formatVersion: 8,
    ...(Array.isArray(commandRules)
      ? { commandRules: commandRules.map((rule) => addCommands(rule, { produce: ["research"] })) }
      : {}),
  }),
};

/**
 * Adds command types to a command rule that refused others. For each type the
 * rule lists, `additions` names the types it now refuses too.
 */
function addCommands(rule: unknown, additions: Record<string, string[]>): unknown {
  if (typeof rule !== "object" || rule === null) return rule;
  const { commands } = rule as { commands?: unknown };
  if (!Array.isArray(commands)) return rule;
  const result = [...commands];
  for (const listed of Object.keys(additions)) {
    if (!commands.includes(listed)) continue;
    for (const type of additions[listed]) if (!result.includes(type)) result.push(type);
  }
  return { ...rule, commands: result };
}

export function migrateScenario(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Scenario is not an object");
  }
  let document = raw as Record<string, unknown>;
  let version = document.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("Scenario has no valid formatVersion");
  }
  if (version > FORMAT_VERSION) {
    throw new Error(`Scenario format ${version} is newer than supported format ${FORMAT_VERSION}`);
  }
  while (version < FORMAT_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`No migration from scenario format ${version}`);
    }
    document = migrate(document);
    version += 1;
  }
  return document;
}

export function loadScenario(raw: unknown): Scenario {
  return scenarioSchema.parse(migrateScenario(raw));
}
