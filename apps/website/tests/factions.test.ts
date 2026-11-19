import { loadScenario } from "data";
import { expect, test } from "vite-plus/test";
import { assignFactions, modelFor } from "../src/factions.ts";
import { seatOnePerson } from "../src/seating.ts";
import moba from "../src/scenarios/moba.json";

const scenario = loadScenario(moba);
/** The MOBA with every seat free to pick a faction. */
const open = loadScenario({
  ...moba,
  players: moba.players.map((player) => ({ ...player, lockFaction: false })),
});

test("unpicked teams take the catalog in team order", () => {
  expect(assignFactions(scenario)).toEqual({
    red: "advanced-utopian",
    redBase: "advanced-utopian",
    blue: "cyber-samurai",
    blueBase: "cyber-samurai",
  });
});

test("a locked seat ignores its pick and takes its team's default", () => {
  expect(seatOnePerson(scenario, { faction: "toxic-industrial" }).factions.red).toBe(
    "advanced-utopian",
  );
});

test("a pick dresses its team, and other teams take factions nobody picked", () => {
  expect(seatOnePerson(open, { faction: "cyber-samurai" }).factions).toEqual({
    red: "cyber-samurai",
    redBase: "cyber-samurai",
    blue: "advanced-utopian",
    blueBase: "advanced-utopian",
  });
});

test("several people on one team keep their own picks, and the team's other players take the first", () => {
  const sixes = loadScenario({
    ...moba,
    players: [
      ...["red", "red2", "red3"].map((id) => ({
        id,
        color: "#e5484d",
        controller: "human",
        team: "west",
      })),
      ...["blue", "blue2", "blue3"].map((id) => ({
        id,
        color: "#3e63dd",
        controller: "human",
        team: "east",
      })),
      ...moba.players.filter((player) => player.controller === "none"),
    ],
  });
  const factions = assignFactions(sixes, {
    red: "toxic-industrial",
    red2: "cyber-samurai",
    blue: "toxic-industrial",
    blue2: "unknown-faction",
  });
  expect(factions).toEqual({
    red: "toxic-industrial",
    red2: "cyber-samurai",
    red3: "toxic-industrial",
    blue: "toxic-industrial",
    blue2: "toxic-industrial",
    blue3: "toxic-industrial",
    redBase: "toxic-industrial",
    blueBase: "toxic-industrial",
  });
});

test("a pick the catalog doesn't know is dropped", () => {
  expect(assignFactions(open, { red: "unknown-faction" }).red).toBe("advanced-utopian");
});

test("an entity draws its owner's faction's model for its look", () => {
  const factions = assignFactions(open, { red: "toxic-industrial" });
  expect(modelFor(open, factions, "tower", "redBase")).toBe(
    "/models/structures/factions/toxic-industrial/refinery.glb",
  );
  expect(modelFor(open, factions, "hero", "blue")).toBe(
    "/models/infantry/factions/advanced-utopian/soldier.glb",
  );
  expect(modelFor(scenario, factions, "tower", null)).toBeUndefined();
});

test("a definition without a look draws as a box", () => {
  const plain = loadScenario({
    ...moba,
    definitions: moba.definitions.map((definition) => ({ ...definition, look: undefined })),
  });
  expect(modelFor(plain, assignFactions(plain), "hero", "red")).toBeUndefined();
});
