import { expect, test } from "vite-plus/test";
import { nextRandomState, randomUnit, seedRandom } from "../src/rng.ts";

function sequence(seed: number, length: number): number[] {
  const values: number[] = [];
  let state = seedRandom(seed);
  for (let i = 0; i < length; i++) {
    state = nextRandomState(state);
    values.push(randomUnit(state));
  }
  return values;
}

test("a seed fixes the sequence", () => {
  expect(sequence(42, 100)).toEqual(sequence(42, 100));
  expect(sequence(43, 100)).not.toEqual(sequence(42, 100));
});

test("small seeds do not start on small values", () => {
  for (let seed = 1; seed <= 20; seed++) expect(sequence(seed, 1)[0]).toBeGreaterThan(0.01);
});

test("values stay in [0, 1) and a zero seed still produces a sequence", () => {
  const values = sequence(0, 1000);
  expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  expect(new Set(values).size).toBe(1000);
});
