import { expect, test } from "vite-plus/test";
import { createCameraRig } from "../src/camera.ts";

function rig() {
  const camera = createCameraRig({ width: 64, height: 48 });
  camera.resize(800, 600);
  return camera;
}

test("the map center starts at the screen center", () => {
  const ground = rig().groundAt({ x: 400, y: 300 })!;
  expect(ground.x).toBeCloseTo(32, 6);
  expect(ground.y).toBeCloseTo(24, 6);
});

test("project is the inverse of groundAt", () => {
  const camera = rig();
  const screen = camera.project(camera.groundAt({ x: 123, y: 456 })!);
  expect(screen.x).toBeCloseTo(123, 6);
  expect(screen.y).toBeCloseTo(456, 6);
});

test("sim x runs right and sim y runs down the screen", () => {
  const camera = rig();
  const origin = camera.project({ x: 32, y: 24 });
  expect(camera.project({ x: 40, y: 24 }).x).toBeGreaterThan(origin.x);
  expect(camera.project({ x: 32, y: 30 }).y).toBeGreaterThan(origin.y);
});

test("pan drags the ground with the pointer", () => {
  const camera = rig();
  const grabbed = camera.groundAt({ x: 400, y: 300 })!;
  camera.pan({ x: 400, y: 300 }, { x: 450, y: 320 });
  const now = camera.groundAt({ x: 450, y: 320 })!;
  expect(now.x).toBeCloseTo(grabbed.x, 6);
  expect(now.y).toBeCloseTo(grabbed.y, 6);
});

test("zoom keeps the ground under the pointer and brings the view closer", () => {
  const camera = rig();
  const at = { x: 500, y: 350 };
  const anchor = camera.groundAt(at)!;
  const spanBefore = camera.groundAt({ x: 800, y: 300 })!.x - camera.groundAt({ x: 0, y: 300 })!.x;
  camera.zoom(0.5, at);
  const spanAfter = camera.groundAt({ x: 800, y: 300 })!.x - camera.groundAt({ x: 0, y: 300 })!.x;
  expect(camera.groundAt(at)!.x).toBeCloseTo(anchor.x, 6);
  expect(camera.groundAt(at)!.y).toBeCloseTo(anchor.y, 6);
  expect(spanAfter).toBeLessThan(spanBefore);
});

test("the camera target stays on the map", () => {
  const camera = rig();
  camera.panGround(1000, 1000);
  const center = camera.groundAt({ x: 400, y: 300 })!;
  expect(center.x).toBeCloseTo(64, 6);
  expect(center.y).toBeCloseTo(48, 6);
});
