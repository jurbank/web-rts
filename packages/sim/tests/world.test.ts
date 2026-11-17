import { expect, test } from "vite-plus/test";
import { skirmishWorld } from "./helpers.ts";

test("a new world has one entity per placement, in placement order", () => {
  let placements: { definitionId: string; x: number; y: number }[] = [];
  const world = skirmishWorld({ edit: (raw) => (placements = raw.placements) });
  expect(world.entities.map(({ definitionId, x, y }) => ({ definitionId, x, y }))).toEqual(
    placements.map(({ definitionId, x, y }) => ({ definitionId, x, y })),
  );
});
