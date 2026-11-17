import { loadScenario } from "data";
import { expect, test } from "vite-plus/test";
import { seatOnePerson } from "../src/seating.ts";
import moba from "../src/scenarios/moba.json";

const ai = { workers: 2, attackSize: 3 };

test("one person takes the first open seat and the ai fills open seats that have settings", () => {
  const scenario = loadScenario({
    ...moba,
    players: [
      { id: "creeps", color: "#8e4ec6", controller: "none" },
      { id: "red", color: "#e5484d", controller: "human", team: "west", ai },
      { id: "green", color: "#30a46c", controller: "human", team: "west", ai },
      { id: "blue", color: "#3e63dd", controller: "human", team: "east" },
      ...moba.players.filter((player) => player.controller === "none"),
    ],
  });
  expect(seatOnePerson(scenario)).toEqual({
    localPlayerId: "red",
    seats: { red: "human", green: "ai" },
  });
});

test("with no open seat, the person takes the first seat anyone commands", () => {
  const scenario = loadScenario({
    ...moba,
    players: moba.players.map((player) => ({
      ...player,
      controller: player.controller === "human" ? "ai" : player.controller,
      ai,
    })),
  });
  expect(seatOnePerson(scenario)).toEqual({ localPlayerId: "red", seats: { red: "human" } });
});
