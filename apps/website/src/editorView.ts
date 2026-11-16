import type { Scenario } from "data";
import { applyOperation, movePlacements, type Operation } from "editor";
import { createRenderer, type ScreenPoint } from "render";
import { createWorld, takeSnapshot, type Point, type Snapshot } from "sim";
import type { GameElements } from "./game.ts";
import { attachInput, showBox } from "./input.ts";
import { session } from "./session.ts";
import { SELECT, useEditor } from "./store.ts";

const SNAP = 0.5;
const snap = (value: number) => Math.round(value / SNAP) * SNAP;

/**
 * Draws the open document and turns input on the map into operations.
 * Returns a function that tears it down.
 */
export function createEditorView(elements: GameElements): () => void {
  const current = () => session.state.history.document;
  const renderer = createRenderer(elements.scene, elements.overlay, current());

  /** A move in progress. Its operation joins the history when the drag ends. */
  let drag: { from: Point; operation: Operation | null; preview: Scenario } | null = null;
  let shown: Scenario | null = null;
  let snapshot: Snapshot;

  /** The document as a tick-zero world, so the editor and the game share one drawing path. */
  function view(): Snapshot {
    const document = drag?.preview ?? current();
    if (document !== shown) {
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
    useEditor.setState({ selection });
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
      const { tool, owner } = useEditor.getState();
      if (tool.kind === "select") {
        const index = placementAt(at, slop);
        select(index < 0 ? [] : [index]);
        return;
      }
      const point = mapPoint(at);
      if (point === null) return;
      const document = current();
      if (tool.kind === "place") {
        const index = document.placements.length;
        const placement = { definitionId: tool.definitionId, playerId: owner, ...point };
        session.edit({ type: "addPlacement", index, placement });
        select([index]);
      } else {
        const index = document.players.findIndex((player) => player.id === tool.playerId);
        const player = { ...document.players[index], start: point };
        session.edit({ type: "setPlayer", index, player });
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
      const index = placementAt(at, 0);
      const from = renderer.pickGround(at);
      if (useEditor.getState().tool.kind !== "select" || index < 0 || from === null) return false;
      if (!useEditor.getState().selection.includes(index)) select([index]);
      drag = { from, operation: null, preview: current() };
      return true;
    },
    dragMove(at) {
      const to = renderer.pickGround(at);
      if (drag === null || to === null) return;
      const document = current();
      const { selection } = useEditor.getState();
      const operation = movePlacements(
        document,
        selection,
        snap(to.x - drag.from.x),
        snap(to.y - drag.from.y),
      );
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
    const { selection } = useEditor.getState();
    renderer.draw(world, world, 0, {
      selectedIds: selection.flatMap((index) => world.entities[index]?.id ?? []),
      debug: false,
      markers: current().players.flatMap((player) =>
        player.start === undefined
          ? []
          : { ...player.start, color: player.color, label: `${player.id} start` },
      ),
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
