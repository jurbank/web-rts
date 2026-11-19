import type { Scenario } from "data";
import type { Choices, Seats } from "sim";
import { assignFactions } from "./factions.ts";

/** Who plays on this device, and who sits in every seat. */
export interface Seating {
  localPlayerId: string;
  seats: Seats;
  /** The faction that draws each player's entities. It changes only looks, and every device needs the same. */
  factions: Record<string, string>;
  /** Setup choices, which `sim` resolves and keeps in the world. */
  choices: Choices;
}

/** What the person chose before the match: a faction, and a choice for each setup option. */
export interface Setup {
  faction?: string;
  options?: Readonly<Record<string, string>>;
}

/**
 * Seats one person, in the first seat open to a human, or else the first seat
 * anyone commands. Every other open seat gets the ai when the scenario gives it
 * ai settings, and otherwise stays empty. The person's setup applies to their
 * seat, and to `match` options, since they host. Every other seat takes the
 * defaults. A lobby replaces this when more than one person plays.
 */
export function seatOnePerson(scenario: Scenario, { faction, options = {} }: Setup = {}): Seating {
  const { players } = scenario;
  const local =
    players.find((player) => player.controller === "human") ??
    players.find((player) => player.controller !== "none") ??
    players[0];
  const seats: Record<string, Scenario["players"][number]["controller"]> = {
    [local.id]: "human",
  };
  for (const player of players) {
    if (player !== local && player.controller === "human" && player.ai !== undefined) {
      seats[player.id] = "ai";
    }
  }
  const picks = faction === undefined ? {} : { [local.id]: faction };
  const choices: Record<string, string | Record<string, string>> = {};
  for (const option of scenario.options) {
    const choice = options[option.id];
    if (choice === undefined) continue;
    choices[option.id] = option.scope === "match" ? choice : { [local.id]: choice };
  }
  return {
    localPlayerId: local.id,
    seats,
    factions: assignFactions(scenario, picks, seats),
    choices,
  };
}
