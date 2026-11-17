import type { Scenario } from "data";
import {
  addItem,
  applyOperation,
  freshId,
  moveGuide,
  movePlacements,
  setItem,
  type Operation,
} from "editor";
import { createRenderer, type ScreenPoint } from "render";
import { createWorld, takeSnapshot, type Point, type Snapshot } from "sim";
import type { GameElements } from "./game.ts";
import { guideAt, scenarioGuides } from "./guides.ts";
import { attachInput, showBox } from "./input.ts";
import { session } from "./session.ts";
import { SELECT, useEditor } from "./store.ts";

const SNAP = 0.5;
const WAYPOINT_COLOR = "#ffffff";
const SELECTED_COLOR = "#ffd60a";
/** How far from a waypoint a tap still picks it, in ground units. */
const WAYPOINT_REACH = 1;
const NEW_REGION_SIZE = 4;
const snap = (value: number) => Math.round(value / SNAP) * SNAP;

/**
 * Draws the open document and turns input on the map into operations.
 * Returns a function that tears it down.
 */
export function createEditorView(elements: GameElements): () => void {
  const current = () => session.state.history.document;
  const renderer = createRenderer(elements.scene, elements.overlay, current());

  /** A move in progress. Its operation joins the history when the drag ends. */
  let drag: {
    from: Point;
    move: (document: Scenario, dx: number, dy: number) => Operation;
    operation: Operation | null;
    preview: Scenario;
  } | null = null;
  let shown: Scenario | null = null;
  let snapshot: Snapshot;

  /** The document as a tick-zero world, so the editor and the game share one drawing path. */
  function view(): Snapshot {
    const document = drag?.preview ?? current();
    if (document !== shown) {
      if (document.definitions !== shown?.definitions || document.players !== shown.players) {
        renderer.setContent(document);
      }
      shown = document;
      snapshot = takeSnapshot(createWorld(document, 1));
    }
    return snapshot;
  }

  /** Entities come out of `createWorld` in placement order. */
  function placementAt(at: ScreenPoint, slop: number): number {
    const id = renderer.pickEntity(at, slop);
    return view().entities.findIndex((entity) => entity.id === id);
  }

  function select(selection: number[]): void {
    useEditor.setState({ selection, guide: null });
  }

  /** The snapped ground point under the pointer, or null when it is off the map. */
  function mapPoint(at: ScreenPoint): Point | null {
    const ground = renderer.pickGround(at);
    const { width, height } = current().map;
    if (ground === null) return null;
    const point = { x: snap(ground.x), y: snap(ground.y) };
    return point.x < 0 || point.y < 0 || point.x > width || point.y > height ? null : point;
  }

  const detachInput = attachInput(elements.battlefield, {
    tap(at, slop) {
      const { tool, owner, guide } = useEditor.getState();
      if (tool.kind === "select") {
        const index = placementAt(at, slop);
        const ground = renderer.pickGround(at);
        if (index >= 0 || ground === null) select(index < 0 ? [] : [index]);
        else {
          useEditor.setState({
            selection: [],
            guide: guideAt(current(), ground, WAYPOINT_REACH),
          });
        }
        return;
      }
      const point = mapPoint(at);
      if (point === null) return;
      const document = current();
      if (tool.kind === "place") {
        const index = document.placements.length;
        const placement = { definitionId: tool.definitionId, playerId: owner, ...point };
        if (session.edit(addItem("placements", index, placement))) select([index]);
      } else if (tool.kind === "waypoint") {
        const index = document.waypoints.length;
        const waypoint = { id: freshId(document.waypoints, "waypoint"), ...point };
        const add = addItem("waypoints", index, waypoint);
        const path = guide?.list === "paths" ? document.paths[guide.index] : undefined;
        if (guide === null || path === undefined) {
          if (session.edit(add)) {
            useEditor.setState({ selection: [], guide: { list: "waypoints", index } });
          }
        } else {
          const extended = { ...path, waypoints: [...path.waypoints, waypoint.id] };
          session.edit({
            type: "batch",
            operations: [add, setItem("paths", guide.index, extended)],
          });
        }
      } else if (tool.kind === "region") {
        const { width, height } = document.map;
        const size = Math.min(NEW_REGION_SIZE, width, height);
        const index = document.regions.length;
        session.edit(
          addItem("regions", index, {
            id: freshId(document.regions, "region"),
            x: Math.min(width - size, Math.max(0, point.x - size / 2)),
            y: Math.min(height - size, Math.max(0, point.y - size / 2)),
            width: size,
            height: size,
          }),
        );
        useEditor.setState({ selection: [], guide: { list: "regions", index }, tool: SELECT });
      } else {
        const index = document.players.findIndex((player) => player.id === tool.playerId);
        const player = { ...document.players[index], start: point };
        session.edit(setItem("players", index, player));
        useEditor.setState({ tool: SELECT });
      }
    },
    order() {},
    boxPreview: (a, b) => showBox(elements.box, a, b),
    boxSelect(a, b) {
      const inside = renderer.entitiesInRect(a, b);
      select(
        view().entities.flatMap((entity, index) => (inside.includes(entity.id) ? [index] : [])),
      );
    },
    dragStart(at) {
      const { tool, selection, guide: selected } = useEditor.getState();
      const from = renderer.pickGround(at);
      if (tool.kind !== "select" || from === null) return false;
      const index = placementAt(at, 0);
      if (index >= 0) {
        if (!selection.includes(index)) select([index]);
        const move: NonNullable<typeof drag>["move"] = (document, dx, dy) =>
          movePlacements(document, useEditor.getState().selection, dx, dy);
        drag = { from, move, operation: null, preview: current() };
        return true;
      }
      const guide = guideAt(current(), from, WAYPOINT_REACH);
      if (guide === null || guide.list === "paths") return false;
      // A region may cover units, so only a selected one moves. Otherwise the drag boxes them.
      const isSelected = selected?.list === guide.list && selected.index === guide.index;
      if (guide.list === "regions" && !isSelected) return false;
      const { list } = guide;
      useEditor.setState({ selection: [], guide });
      const move: NonNullable<typeof drag>["move"] = (document, dx, dy) =>
        moveGuide(document, list, guide.index, dx, dy);
      drag = { from, move, operation: null, preview: current() };
      return true;
    },
    dragMove(at) {
      const to = renderer.pickGround(at);
      if (drag === null || to === null) return;
      const document = current();
      const operation = drag.move(document, snap(to.x - drag.from.x), snap(to.y - drag.from.y));
      drag.operation = operation;
      drag.preview = applyOperation(document, operation).document;
    },
    dragEnd(at) {
      const operation = drag?.operation;
      drag = null;
      if (at !== null && operation) session.edit(operation);
    },
    pan: (from, to) => renderer.pan(from, to),
    zoom: (factor, at) => renderer.zoom(factor, at),
    cancel() {
      if (useEditor.getState().tool.kind === "select") select([]);
      else useEditor.setState({ tool: SELECT });
    },
  });

  function resize(): void {
    const { clientWidth, clientHeight } = elements.battlefield;
    renderer.resize(clientWidth, clientHeight, Math.min(window.devicePixelRatio, 2));
  }
  const observer = new ResizeObserver(resize);
  observer.observe(elements.battlefield);
  resize();

  let frameId = requestAnimationFrame(function frame() {
    const world = view();
    const document = current();
    const { selection, guide } = useEditor.getState();
    const { routes, zones } = scenarioGuides(document);
    const chosen = (list: string, index: number) =>
      guide?.list === list && guide.index === index ? { color: SELECTED_COLOR } : {};
    const onPath = guide?.list === "paths" ? document.paths[guide.index]?.waypoints : undefined;
    renderer.draw(world, world, 0, {
      selectedIds: selection.flatMap((index) => world.entities[index]?.id ?? []),
      debug: false,
      markers: [
        ...document.players.flatMap((player) =>
          player.start === undefined
            ? []
            : { ...player.start, color: player.color, label: `${player.id} start` },
        ),
        ...document.waypoints.map((waypoint, index) => ({
          ...waypoint,
          color: WAYPOINT_COLOR,
          label: waypoint.id,
          ...chosen("waypoints", index),
          ...(onPath?.includes(waypoint.id) ? { color: SELECTED_COLOR } : {}),
        })),
      ],
      routes: routes?.map((route, index) => ({ ...route, ...chosen("paths", index) })),
      zones: zones?.map((zone, index) => ({ ...zone, ...chosen("regions", index) })),
    });
    frameId = requestAnimationFrame(frame);
  });

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    detachInput();
    renderer.dispose();
  };
}
