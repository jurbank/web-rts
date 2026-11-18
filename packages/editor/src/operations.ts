import { scenarioSchema, type Scenario } from "data";

/** The lists of a scenario that operations edit. */
type Lists = Pick<
  Scenario,
  "placements" | "players" | "definitions" | "waypoints" | "paths" | "regions" | "triggers"
>;
export type ListName = keyof Lists;
type Item<K extends ListName> = Lists[K][number];
/** The lists the editor draws on the map besides placements. */
export type GuideList = "waypoints" | "paths" | "regions";

/** Plain data. An index refers to the document the operation is applied to. */
export type Operation =
  | { type: "setFogOfWar"; enabled: boolean }
  | {
      [K in ListName]:
        | { type: "add"; list: K; index: number; item: Item<K> }
        | { type: "remove"; list: K; index: number }
        | { type: "set"; list: K; index: number; item: Item<K> };
    }[ListName]
  /** Applied in order and undone as one. */
  | { type: "batch"; operations: Operation[] };

export function addItem<K extends ListName>(list: K, index: number, item: Item<K>): Operation {
  return { type: "add", list, index, item } as Operation;
}

export function removeItem(list: ListName, index: number): Operation {
  return { type: "remove", list, index };
}

export function setItem<K extends ListName>(list: K, index: number, item: Item<K>): Operation {
  return { type: "set", list, index, item } as Operation;
}

/** Returns a new document and the operation that undoes this one (E2). The input is not changed. */
export function applyOperation(
  document: Scenario,
  operation: Operation,
): { document: Scenario; inverse: Operation } {
  if (operation.type === "setFogOfWar") {
    return {
      document: { ...document, fogOfWar: operation.enabled },
      inverse: { type: "setFogOfWar", enabled: document.fogOfWar },
    };
  }
  if (operation.type === "batch") {
    let current = document;
    const inverses: Operation[] = [];
    for (const each of operation.operations) {
      const applied = applyOperation(current, each);
      current = applied.document;
      inverses.unshift(applied.inverse);
    }
    return { document: current, inverse: { type: "batch", operations: inverses } };
  }
  const { list, index } = operation;
  const items: readonly Item<ListName>[] = document[list];
  requireIndex(index, operation.type === "add" ? items.length + 1 : items.length);
  switch (operation.type) {
    case "add":
      return {
        document: { ...document, [list]: items.toSpliced(index, 0, operation.item) },
        inverse: removeItem(list, index),
      };
    case "remove":
      return {
        document: { ...document, [list]: items.toSpliced(index, 1) },
        inverse: addItem(list, index, items[index]),
      };
    case "set":
      return {
        document: { ...document, [list]: items.with(index, operation.item) },
        inverse: setItem(list, index, items[index]),
      };
  }
}

/**
 * What stops the document from loading, one line per problem. The app refuses
 * an edit that leaves any, such as removing a waypoint a path still visits (C3).
 */
export function documentIssues(document: Scenario): string[] {
  const result = scenarioSchema.safeParse(document);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

/** An id no item has yet: the prefix and the lowest free number. */
export function freshId(items: readonly { id: string }[], prefix: string): string {
  const taken = new Set(items.map((item) => item.id));
  let number = 1;
  while (taken.has(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
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
    operations: descending.map((index) => removeItem("placements", index)),
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
    x: clamp(placement.x + dx, width),
    y: clamp(placement.y + dy, height),
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
  edit: (placement: Item<"placements">) => Item<"placements">,
): Operation {
  return {
    type: "batch",
    operations: indices.map((index) =>
      setItem("placements", index, edit(document.placements[index])),
    ),
  };
}

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

/** Shifts a waypoint or a region by an offset, keeping all of it inside the map. */
export function moveGuide(
  document: Scenario,
  list: "waypoints" | "regions",
  index: number,
  dx: number,
  dy: number,
): Operation {
  const { width, height } = document.map;
  if (list === "waypoints") {
    const waypoint = document.waypoints[index];
    return setItem("waypoints", index, {
      ...waypoint,
      x: clamp(waypoint.x + dx, width),
      y: clamp(waypoint.y + dy, height),
    });
  }
  const region = document.regions[index];
  return setItem("regions", index, {
    ...region,
    x: clamp(region.x + dx, width - region.width),
    y: clamp(region.y + dy, height - region.height),
  });
}

/** Gives a waypoint, path, or region a new id, and updates the paths and triggers that name it. */
export function renameGuide(
  document: Scenario,
  list: GuideList,
  index: number,
  id: string,
): Operation {
  const old = document[list][index].id;
  const swap = (value: string) => (value === old ? id : value);
  const operations = [setItem(list, index, { ...document[list][index], id } as Item<GuideList>)];
  if (list === "waypoints") {
    document.paths.forEach((path, at) => {
      if (!path.waypoints.includes(old)) return;
      operations.push(setItem("paths", at, { ...path, waypoints: path.waypoints.map(swap) }));
    });
  }
  document.triggers.forEach((trigger, at) => {
    const event =
      list === "regions" && trigger.event.type === "entered"
        ? { ...trigger.event, region: swap(trigger.event.region) }
        : trigger.event;
    const actions = trigger.actions.map((action) => {
      if (action.type === "reveal" && list === "regions")
        return { ...action, region: swap(action.region) };
      if (action.type === "walk") {
        return list === "paths" ? { ...action, path: swap(action.path) } : action;
      }
      if (action.type !== "spawn") return action;
      if (list === "waypoints") return { ...action, at: swap(action.at) };
      if (list === "paths" && action.path !== undefined) {
        return { ...action, path: swap(action.path) };
      }
      return action;
    });
    const renamed = { ...trigger, event, actions };
    if (JSON.stringify(renamed) !== JSON.stringify(trigger)) {
      operations.push(setItem("triggers", at, renamed));
    }
  });
  return { type: "batch", operations };
}
