import type { Scenario } from "data";
import type { Overlay } from "render";
import type { Point } from "sim";
import type { GuideRef } from "./store.ts";

/** The scenario's paths and regions, for the renderer to draw over the ground. */
export function scenarioGuides(scenario: Scenario): Pick<Overlay, "routes" | "zones"> {
  const waypoints = new Map(scenario.waypoints.map((waypoint) => [waypoint.id, waypoint]));
  return {
    routes: scenario.paths.map((path) => ({
      label: path.id,
      points: path.waypoints.flatMap((id) => waypoints.get(id) ?? []),
    })),
    zones: scenario.regions.map((region) => ({ ...region, label: region.id })),
  };
}

/**
 * The waypoint within `reach` of a ground point, or else the region around it.
 * Paths are picked from the editor's list, not from the map.
 */
export function guideAt(scenario: Scenario, point: Point, reach: number): GuideRef | null {
  let nearest: GuideRef | null = null;
  let distance = reach;
  scenario.waypoints.forEach((waypoint, index) => {
    const away = Math.hypot(waypoint.x - point.x, waypoint.y - point.y);
    if (away > distance) return;
    distance = away;
    nearest = { list: "waypoints", index };
  });
  if (nearest !== null) return nearest;
  const index = scenario.regions.findLastIndex(
    (region) =>
      point.x >= region.x &&
      point.x <= region.x + region.width &&
      point.y >= region.y &&
      point.y <= region.y + region.height,
  );
  return index < 0 ? null : { list: "regions", index };
}
