import { loadScenario, type Scenario } from "data";
import { VICTORY_TRIGGER } from "./victory.ts";

/**
 * An empty map that keeps the players, definitions, and victory trigger of
 * `base`. Other triggers and command rules go with the map, since they may name
 * its regions, waypoints, and variables.
 */
export function blankDocument(base: Scenario, map: Scenario["map"]): Scenario {
  return {
    ...base,
    map,
    players: base.players.map((player) => {
      const copy = { ...player };
      delete copy.start;
      return copy;
    }),
    placements: [],
    variables: [],
    timers: [],
    regions: [],
    waypoints: [],
    paths: [],
    triggers: base.triggers.filter(({ id }) => id === VICTORY_TRIGGER),
    commandRules: [],
  };
}

/** The document is scenario data, so serializing it is saving (E1). */
export function serializeDocument(document: Scenario): string {
  return JSON.stringify(document);
}

/** Migrates and validates, as every load does (C3). */
export function parseDocument(serialized: string): Scenario {
  return loadScenario(JSON.parse(serialized));
}
