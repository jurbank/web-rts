import { loadScenario, type Scenario } from "data";
import skirmish from "./scenarios/skirmish.json";
import towerDefense from "./scenarios/tower-defense.json";

/** Scenarios that ship with the app, in menu order. Each goes through the same load as a saved file. */
export const examples: readonly { name: string; scenario: Scenario }[] = [
  { name: "Skirmish", scenario: loadScenario(skirmish) },
  { name: "Tower defense", scenario: loadScenario(towerDefense) },
];
