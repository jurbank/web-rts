import type { Scenario } from "data";
import type { Seats } from "sim";

export interface Faction {
  readonly id: string;
  readonly name: string;
  /** Each look type this faction draws, as a model under `public/models`. */
  readonly models: Readonly<Record<string, string>>;
}

/**
 * The factions a player can pick, in the order teams get them by default. A
 * look a faction has no model for draws as a box. Where a faction has no art
 * for a look yet, an existing model stands in, such as a supply depot as its shop.
 */
export const FACTIONS: readonly Faction[] = [
  {
    id: "advanced-utopian",
    name: "Advanced utopian",
    models: {
      soldier: "infantry/factions/advanced-utopian/soldier",
      hero: "infantry/factions/advanced-utopian/soldier",
      creep: "infantry/factions/advanced-utopian/soldier",
      hq: "structures/factions/advanced-utopian/hq",
      "supply-depot": "structures/factions/advanced-utopian/supply-depot",
      "war-factory": "structures/factions/advanced-utopian/war-factory",
      "science-lab": "structures/factions/advanced-utopian/science-lab",
      ancient: "structures/factions/advanced-utopian/hq",
      tower: "structures/factions/advanced-utopian/science-lab",
      shop: "structures/factions/advanced-utopian/supply-depot",
    },
  },
  {
    id: "cyber-samurai",
    name: "Cyber samurai",
    models: {
      soldier: "infantry/factions/cyber-samurai/blade-infantry",
      hero: "infantry/factions/cyber-samurai/blade-infantry",
      creep: "infantry/factions/cyber-samurai/blade-infantry",
      tank: "vehicles/factions/cyber-samurai/laser-tank",
      refinery: "structures/factions/cyber-samurai/refinery",
      "supply-depot": "structures/factions/cyber-samurai/supply-depot",
      "war-factory": "structures/factions/cyber-samurai/war-factory",
      ancient: "structures/factions/cyber-samurai/war-factory",
      tower: "structures/factions/cyber-samurai/refinery",
      shop: "structures/factions/cyber-samurai/supply-depot",
    },
  },
  {
    id: "toxic-industrial",
    name: "Toxic industrial",
    models: {
      soldier: "infantry/factions/toxic-industrial/soldier",
      hero: "infantry/factions/toxic-industrial/soldier",
      creep: "infantry/factions/toxic-industrial/soldier",
      tank: "vehicles/factions/toxic-industrial/flame-tank",
      refinery: "structures/factions/toxic-industrial/refinery",
      "supply-depot": "structures/factions/toxic-industrial/supply-depot",
      "war-factory": "structures/factions/toxic-industrial/war-factory",
      ancient: "structures/factions/toxic-industrial/war-factory",
      tower: "structures/factions/toxic-industrial/refinery",
      shop: "structures/factions/toxic-industrial/supply-depot",
    },
  },
];

/** Every look some faction draws, for the editor. */
export const LOOKS: readonly string[] = [
  ...new Set(FACTIONS.flatMap((faction) => Object.keys(faction.models))),
].sort();

const teamOf = (player: Scenario["players"][number]) => player.team ?? player.id;

/**
 * The faction of every player. Seated players keep their pick. A team nobody
 * picked for takes the next faction in the catalog that no picked team has, in
 * team order. A player that commands nothing, such as one that only owns
 * towers, takes the faction of the first seated player on its team. A seat with
 * a locked faction ignores its pick.
 */
export function assignFactions(
  scenario: Scenario,
  picks: Readonly<Record<string, string>> = {},
  seats: Seats = {},
): Record<string, string> {
  // Mirrors `createWorld`: a seat can't make a `none` player commanded.
  const seated = (player: Scenario["players"][number]) =>
    player.controller !== "none" && (seats[player.id] ?? player.controller) !== "none";
  const teams = [...new Set(scenario.players.map(teamOf))];
  const locked = new Set(
    scenario.players.filter((player) => player.lockFaction).map((player) => player.id),
  );
  const pickOf = (playerId: string) => {
    const id = locked.has(playerId) ? undefined : picks[playerId];
    return FACTIONS.some((faction) => faction.id === id) ? id : undefined;
  };
  const byTeam = new Map<string, string>();
  for (const player of scenario.players) {
    const pick = pickOf(player.id);
    if (seated(player) && pick !== undefined && !byTeam.has(teamOf(player))) {
      byTeam.set(teamOf(player), pick);
    }
  }
  const picked = new Set(byTeam.values());
  const unpicked = FACTIONS.filter((faction) => !picked.has(faction.id));
  const spare = unpicked.length > 0 ? unpicked : FACTIONS;
  let next = 0;
  for (const team of teams) {
    if (!byTeam.has(team)) byTeam.set(team, spare[next++ % spare.length].id);
  }
  const fallback = (team: string) => byTeam.get(team)!;
  return Object.fromEntries(
    scenario.players.map((player) => [
      player.id,
      (seated(player) ? pickOf(player.id) : undefined) ?? fallback(teamOf(player)),
    ]),
  );
}

/** The GLB that draws an entity: its owner's faction's model for its definition's look. */
export function modelFor(
  scenario: Scenario,
  factions: Readonly<Record<string, string>>,
  definitionId: string,
  playerId: string | null,
): string | undefined {
  if (playerId === null) return undefined;
  const look = scenario.definitions.find((definition) => definition.id === definitionId)?.look;
  const faction = FACTIONS.find((candidate) => candidate.id === factions[playerId]);
  const path = look === undefined ? undefined : faction?.models[look];
  return path === undefined ? undefined : `${import.meta.env.BASE_URL}models/${path}.glb`;
}
