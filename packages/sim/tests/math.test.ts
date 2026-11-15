import { expect, test } from "vite-plus/test";
import { atan2, cos, sin } from "../src/index.ts";

test("sin and cos track the platform functions", () => {
  for (let angle = -20; angle <= 20; angle += 0.0137) {
    expect(Math.abs(sin(angle) - Math.sin(angle))).toBeLessThan(1e-10);
    expect(Math.abs(cos(angle) - Math.cos(angle))).toBeLessThan(1e-10);
  }
});

test("atan2 tracks the platform function in every quadrant", () => {
  for (let y = -3; y <= 3; y += 0.173) {
    for (let x = -3; x <= 3; x += 0.191) {
      expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-10);
    }
  }
  expect(atan2(0, 0)).toBe(0);
  expect(atan2(1, 0)).toBe(Math.PI / 2);
  expect(atan2(0, -1)).toBe(Math.PI);
});
