import { FORMAT_VERSION } from "data";
import { expect, test } from "vite-plus/test";
import { TICK_RATE, TICK_SECONDS } from "../src/index.ts";

test("one second is a whole number of ticks", () => {
  expect(TICK_RATE).toBe(30);
  expect(TICK_SECONDS * TICK_RATE).toBe(1);
});

test("resolves the data package through its entry point", () => {
  expect(FORMAT_VERSION).toBe(1);
});
