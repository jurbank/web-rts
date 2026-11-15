import { FORMAT_VERSION, scenarioSchema, type Scenario } from "./scenario.ts";

type Migration = (document: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version a migration reads. Each returns the next version. */
const migrations: Record<number, Migration> = {};

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
