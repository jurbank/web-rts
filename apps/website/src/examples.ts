import { loadScenario, type Scenario } from "data";
import autoChess from "./scenarios/auto-chess.json";
import moba from "./scenarios/moba.json";
import skirmish from "./scenarios/skirmish.json";
import threeLaneMoba from "./scenarios/three-lane-moba.json";
import towerDefense from "./scenarios/tower-defense.json";

/** Scenarios that ship with the app, in menu order. Each goes through the same load as a saved file. */
export const examples: readonly { name: string; scenario: Scenario }[] = [
  { name: "Skirmish", scenario: loadScenario(skirmish) },
  { name: "Tower defense", scenario: loadScenario(towerDefense) },
  { name: "MOBA", scenario: loadScenario(moba) },
  { name: "Auto chess", scenario: loadScenario(autoChess) },
  { name: "Three-lane MOBA", scenario: loadScenario(threeLaneMoba) },
];
