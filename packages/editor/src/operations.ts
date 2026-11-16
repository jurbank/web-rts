import type { Placement, Player, Scenario, Victory } from "data";

/** Plain data. An index refers to the document the operation is applied to. */
export type Operation =
  | { type: "addPlacement"; index: number; placement: Placement }
  | { type: "removePlacement"; index: number }
  | { type: "setPlacement"; index: number; placement: Placement }
  | { type: "setPlayer"; index: number; player: Player }
  | { type: "setVictory"; victory: Victory }
  /** Applied in order and undone as one. */
  | { type: "batch"; operations: Operation[] };

/** Returns a new document and the operation that undoes this one (E2). The input is not changed. */
export function applyOperation(
  document: Scenario,
  operation: Operation,
): { document: Scenario; inverse: Operation } {
  switch (operation.type) {
    case "addPlacement": {
      const { index, placement } = operation;
      requireIndex(index, document.placements.length + 1);
      return {
        document: { ...document, placements: document.placements.toSpliced(index, 0, placement) },
        inverse: { type: "removePlacement", index },
      };
    }
    case "removePlacement": {
      const { index } = operation;
      requireIndex(index, document.placements.length);
      return {
        document: { ...document, placements: document.placements.toSpliced(index, 1) },
        inverse: { type: "addPlacement", index, placement: document.placements[index] },
      };
    }
    case "setPlacement": {
      const { index, placement } = operation;
      requireIndex(index, document.placements.length);
      return {
        document: { ...document, placements: document.placements.with(index, placement) },
        inverse: { type: "setPlacement", index, placement: document.placements[index] },
      };
    }
    case "setPlayer": {
      const { index, player } = operation;
      requireIndex(index, document.players.length);
      return {
        document: { ...document, players: document.players.with(index, player) },
        inverse: { type: "setPlayer", index, player: document.players[index] },
      };
    }
    case "setVictory":
      return {
        document: { ...document, victory: operation.victory },
        inverse: { type: "setVictory", victory: document.victory },
      };
    case "batch": {
      let current = document;
      const inverses: Operation[] = [];
      for (const each of operation.operations) {
        const applied = applyOperation(current, each);
        current = applied.document;
        inverses.unshift(applied.inverse);
      }
      return { document: current, inverse: { type: "batch", operations: inverses } };
    }
  }
}

function requireIndex(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(`Operation index ${index} is out of range`);
  }
}

export function removePlacements(indices: readonly number[]): Operation {
  // Highest first, so removing one does not shift the rest.
  const descending = [...indices].sort((a, b) => b - a);
  return {
    type: "batch",
    operations: descending.map((index) => ({ type: "removePlacement", index })),
  };
}

/** Shifts placements by an offset, keeping each inside the map. */
export function movePlacements(
  document: Scenario,
  indices: readonly number[],
  dx: number,
  dy: number,
): Operation {
  const { width, height } = document.map;
  return editPlacements(document, indices, (placement) => ({
    ...placement,
    x: Math.min(width, Math.max(0, placement.x + dx)),
    y: Math.min(height, Math.max(0, placement.y + dy)),
  }));
}

/** Gives placements to a player, or to nobody when `playerId` is null. */
export function assignPlacements(
  document: Scenario,
  indices: readonly number[],
  playerId: string | null,
): Operation {
  return editPlacements(document, indices, (placement) => ({ ...placement, playerId }));
}

function editPlacements(
  document: Scenario,
  indices: readonly number[],
  edit: (placement: Placement) => Placement,
): Operation {
  return {
    type: "batch",
    operations: indices.map((index) => ({
      type: "setPlacement",
      index,
      placement: edit(document.placements[index]),
    })),
  };
}
