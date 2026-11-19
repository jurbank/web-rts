import { loadScenario } from "data";
import { createWorld, TICK_RATE } from "sim";
import { expect, test } from "vite-plus/test";
import { createGameLoop } from "../src/loop.ts";
import skirmish from "../src/scenarios/skirmish.json";

function loop() {
  return createGameLoop(createWorld(loadScenario(skirmish), 1), "red");
}

test("real time turns into whole ticks plus a remainder", () => {
  const game = loop();
  const alpha = game.advance(0.1 + 0.5 / TICK_RATE);
  expect(game.tick).toBe(3);
  expect(alpha).toBeCloseTo(0.5, 6);
  expect(game.current.tick).toBe(3);
  expect(game.previous.tick).toBe(2);
});

test("a frame that steps several ticks keeps the events of each", () => {
  const world = createWorld(loadScenario(skirmish), 1);
  const game = createGameLoop(world, "red");
  const unit = world.entities[1];
  unit.health = 0;
  game.advance(3 / TICK_RATE);
  expect(game.current.events).toEqual([]);
  expect(game.takeEvents()).toEqual([
    { tick: 1, events: [expect.objectContaining({ type: "died", id: unit.id, playerId: "red" })] },
  ]);
  expect(game.takeEvents()).toEqual([]);
});

test("events left untaken for over a second keep only the last second", () => {
  const world = createWorld(loadScenario(skirmish), 1);
  const game = createGameLoop(world, "red");
  const workers = world.entities.filter(
    (entity) => entity.playerId === "red" && entity.definitionId === "worker",
  );
  // A death every other quarter second, with nothing taken for a second and a half.
  for (let frame = 0; frame < 6; frame++) {
    if (frame % 2 === 0) workers[frame / 2].health = 0;
    game.advance(0.25);
  }
  const taken = game.takeEvents();
  const newest = taken.at(-1)!.tick;
  expect(taken).toHaveLength(2);
  expect(taken.every(({ tick }) => tick > newest - TICK_RATE)).toBe(true);
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

test("the game loop keeps both interpolation snapshots scoped to its seat", () => {
  const scenario = loadScenario(skirmish);
  const blue = createGameLoop(createWorld(scenario, 1), "blue");
  blue.advance(2 / TICK_RATE);
  for (const frame of [blue.previous, blue.current]) {
    expect(frame.fog).toBeDefined();
    expect(frame.entities.some((entity) => entity.playerId === "red")).toBe(false);
    expect(frame.players.find((player) => player.id === "red")).not.toHaveProperty("resources");
    expect(frame.players.find((player) => player.id === "blue")?.resources).toBeDefined();
  }
});
