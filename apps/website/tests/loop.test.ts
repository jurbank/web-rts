import { loadScenario } from "data";
import { createWorld, TICK_RATE } from "sim";
import { expect, test } from "vite-plus/test";
import { createGameLoop } from "../src/loop.ts";
import skirmish from "../src/scenarios/skirmish.json";

function loop() {
  return createGameLoop(createWorld(loadScenario(skirmish), 1));
}

test("real time turns into whole ticks plus a remainder", () => {
  const game = loop();
  const alpha = game.advance(0.1 + 0.5 / TICK_RATE);
  expect(game.tick).toBe(3);
  expect(alpha).toBeCloseTo(0.5, 6);
  expect(game.current.tick).toBe(3);
  expect(game.previous.tick).toBe(2);
});

test("a long stall is capped", () => {
  const game = loop();
  game.advance(60);
  expect(game.tick).toBeLessThanOrEqual(TICK_RATE / 4 + 1);
});

test("a submitted command runs on the next step", () => {
  const game = loop();
  const unit = game.current.entities[1];
  game.submit({
    type: "move",
    playerId: "red",
    tick: game.tick,
    unitIds: [unit.id],
    x: 30,
    y: unit.y,
  });
  game.advance(1 / TICK_RATE);
  expect(game.current.entities[1].x).toBeGreaterThan(unit.x);
});

test("a command for a later tick waits for it, and a late one is refused", () => {
  const game = loop();
  const unit = game.current.entities[1];
  const move = (tick: number) =>
    game.submit({ type: "move", playerId: "red", tick, unitIds: [unit.id], x: 30, y: unit.y });
  expect(move(game.tick + 2)).toBe(true);
  game.advance(2 / TICK_RATE);
  expect(game.current.entities[1].x).toBe(unit.x);
  game.advance(1 / TICK_RATE);
  expect(game.current.entities[1].x).toBeGreaterThan(unit.x);
  expect(move(game.tick - 1)).toBe(false);
});
