import { expect, test } from "vite-plus/test";
import { sampleClip } from "../src/clips.ts";

const move = { start: 20, frames: 12, loop: true };
const die = { start: 43, frames: 25, loop: false };

test("a loop steps between neighboring rows and wraps to its first", () => {
  expect(sampleClip(move, 20, 0.125)).toEqual([22, 23, expect.closeTo(0.5, 6)]);
  expect(sampleClip(move, 20, 11 / 20)).toEqual([31, 20, expect.closeTo(0, 6)]);
  expect(sampleClip(move, 20, 12 / 20)).toEqual([20, 21, expect.closeTo(0, 6)]);
});

test("a one-shot holds its last row once it ends", () => {
  expect(sampleClip(die, 20, 0)).toEqual([43, 44, 0]);
  expect(sampleClip(die, 20, 10)).toEqual([67, 67, 0]);
});
