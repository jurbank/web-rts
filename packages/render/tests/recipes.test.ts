import { expect, test } from "vite-plus/test";
import {
  DEATH_KINDS,
  pickRecipe,
  RECIPES,
  SHOT_KINDS,
  type Recipe,
} from "../src/effects/recipes.ts";

const samuraiLaser: Recipe = { emitters: [] };
const styled = { "cyber-samurai/laser": samuraiLaser };

test("a style plays its own version of a kind, and the generic one where it has none", () => {
  expect(pickRecipe("laser", SHOT_KINDS, "bullet", "cyber-samurai", styled)).toBe(samuraiLaser);
  expect(pickRecipe("flame", SHOT_KINDS, "bullet", "cyber-samurai", styled)).toBe(RECIPES.flame);
  expect(pickRecipe("laser", SHOT_KINDS, "bullet", undefined, styled)).toBe(RECIPES.laser);
});

test("a kind no recipe knows plays the fallback, even one every object has", () => {
  for (const kind of ["constructor", "toString", "hasOwnProperty", "plasma", "building-death"]) {
    expect(pickRecipe(kind, SHOT_KINDS, "bullet", "cyber-samurai", styled)).toBe(RECIPES.bullet);
  }
  expect(pickRecipe("laser", DEATH_KINDS, "unit-death", undefined)).toBe(RECIPES["unit-death"]);
});
