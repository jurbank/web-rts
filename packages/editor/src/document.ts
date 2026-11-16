import { loadScenario, type Scenario } from "data";

/** An empty map that keeps the players, definitions, and victory condition of `base`. */
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
