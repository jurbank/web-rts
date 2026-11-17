import type { Scenario } from "data";
import type { Seats } from "sim";

/** Who plays on this device, and who sits in every seat. */
export interface Seating {
  localPlayerId: string;
  seats: Seats;
}

/**
 * Seats one person, in the first seat open to a human, or else the first seat
 * anyone commands. Every other open seat gets the ai when the scenario gives it
 * ai settings, and otherwise stays empty. A lobby replaces this when more than
 * one person plays.
 */
export function seatOnePerson(scenario: Scenario): Seating {
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
  return { localPlayerId: local.id, seats };
}
