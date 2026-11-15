import { definitionOf, NAV_CLEARANCE, type Entity, type Point, type World } from "./world.ts";

const STRAIGHT = 10;
const DIAGONAL = 14;
const UNREACHED = 0x7fffffff;

/**
 * A route from the entity to `goal` around everything that does not move, on
 * a grid of unit cells. When the goal cannot be reached the route ends at the
 * reachable cell nearest to it. The entity's own position is not included.
 */
export function findPath(world: World, entity: Entity, goal: Point): Point[] {
  const columns = Math.ceil(world.map.width);
  const rows = Math.ceil(world.map.height);
  const blocked = blockedCells(world, definitionOf(world, entity).radius, columns, rows);
  const cellOf = (point: Point) =>
    clampIndex(Math.floor(point.y), rows) * columns + clampIndex(Math.floor(point.x), columns);

  const start = cellOf(entity);
  const end = cellOf(goal);
  const endColumn = end % columns;
  const endRow = (end - endColumn) / columns;
  const estimate = (cell: number) => {
    const column = cell % columns;
    const dx = Math.abs(column - endColumn);
    const dy = Math.abs((cell - column) / columns - endRow);
    return STRAIGHT * (dx + dy) + (DIAGONAL - 2 * STRAIGHT) * Math.min(dx, dy);
  };

  const cellCount = columns * rows;
  const cost = new Int32Array(cellCount).fill(UNREACHED);
  const parent = new Int32Array(cellCount).fill(-1);
  const closed = new Uint8Array(cellCount);
  // Each heap entry packs priority and cell into one number, which is a total order.
  const open = createHeap();
  const push = (cell: number) => open.push((cost[cell] + estimate(cell)) * cellCount + cell);
  cost[start] = 0;
  push(start);
  let best = start;

  while (open.size() > 0) {
    const cell = open.pop() % cellCount;
    if (closed[cell] === 1) continue;
    closed[cell] = 1;
    if (estimate(cell) < estimate(best)) best = cell;
    if (cell === end) break;
    const column = cell % columns;
    const row = (cell - column) / columns;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nextColumn = column + dx;
        const nextRow = row + dy;
        if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) continue;
        const next = nextRow * columns + nextColumn;
        if (blocked[next] === 1 || closed[next] === 1) continue;
        const diagonal = dx !== 0 && dy !== 0;
        // No cutting corners between two blocked cells.
        if (diagonal && (blocked[cell + dx] === 1 || blocked[cell + dy * columns] === 1)) continue;
        const nextCost = cost[cell] + (diagonal ? DIAGONAL : STRAIGHT);
        if (nextCost < cost[next]) {
          cost[next] = nextCost;
          parent[next] = cell;
          push(next);
        }
      }
    }
  }

  const cells: number[] = [];
  for (let cell = best; cell !== start; cell = parent[cell]) {
    cells.push(cell);
  }
  cells.reverse();
  const points = cells.map((cell) => {
    const column = cell % columns;
    return { x: column + 0.5, y: (cell - column) / columns + 0.5 };
  });
  if (best === end && blocked[end] === 0 && points.length > 0) {
    points[points.length - 1] = { x: goal.x, y: goal.y };
  } else if (best === end && start === end && blocked[end] === 0) {
    points.push({ x: goal.x, y: goal.y });
  }

  const clear = (a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const steps = Math.ceil(Math.sqrt(dx * dx + dy * dy) * 4);
    for (let i = 1; i <= steps; i++) {
      const cell = cellOf({ x: a.x + (dx * i) / steps, y: a.y + (dy * i) / steps });
      if (blocked[cell] === 1 && cell !== start) return false;
    }
    return true;
  };
  return straighten({ x: entity.x, y: entity.y }, points, clear);
}

/** Drops waypoints that a straight line can skip. */
function straighten(from: Point, points: Point[], clear: (a: Point, b: Point) => boolean): Point[] {
  const result: Point[] = [];
  let anchor = from;
  let index = 0;
  while (index < points.length) {
    let reach = points.length - 1;
    while (reach > index && !clear(anchor, points[reach])) reach -= 1;
    anchor = points[reach];
    result.push(anchor);
    index = reach + 1;
  }
  return result;
}

/** Cells whose center is too close to something that does not move for `radius` to fit. */
function blockedCells(world: World, radius: number, columns: number, rows: number): Uint8Array {
  const blocked = new Uint8Array(columns * rows);
  for (const entity of world.entities) {
    const definition = definitionOf(world, entity);
    if (definition.speed !== undefined) continue;
    const reach = definition.radius + radius + NAV_CLEARANCE;
    const firstColumn = clampIndex(Math.floor(entity.x - reach), columns);
    const lastColumn = clampIndex(Math.floor(entity.x + reach), columns);
    const firstRow = clampIndex(Math.floor(entity.y - reach), rows);
    const lastRow = clampIndex(Math.floor(entity.y + reach), rows);
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const dx = column + 0.5 - entity.x;
        const dy = row + 0.5 - entity.y;
        if (dx * dx + dy * dy < reach * reach) blocked[row * columns + column] = 1;
      }
    }
  }
  return blocked;
}

function clampIndex(value: number, count: number): number {
  return Math.min(count - 1, Math.max(0, value));
}

/** A binary min-heap of numbers. */
function createHeap() {
  const items: number[] = [];
  return {
    size: () => items.length,
    push(value: number): void {
      let index = items.length;
      items.push(value);
      while (index > 0) {
        const up = (index - 1) >> 1;
        if (items[index] >= items[up]) break;
        [items[index], items[up]] = [items[up], items[index]];
        index = up;
      }
    },
    pop(): number {
      const top = items[0];
      const last = items.pop()!;
      if (items.length > 0) {
        items[0] = last;
        let index = 0;
        for (;;) {
          const left = index * 2 + 1;
          const right = left + 1;
          let least = index;
          if (left < items.length && items[left] < items[least]) least = left;
          if (right < items.length && items[right] < items[least]) least = right;
          if (least === index) break;
          [items[index], items[least]] = [items[least], items[index]];
          index = least;
        }
      }
      return top;
    },
  };
}
