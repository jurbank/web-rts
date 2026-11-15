import type { ScreenPoint } from "render";

/** What the player means, whichever device said it (U1). */
export interface Intents {
  /** A press and release in place. `slop` is how far off a unit it may land, in pixels. */
  tap(at: ScreenPoint, slop: number): void;
  /** An explicit order at a point, without the tap's select-first rule. */
  order(at: ScreenPoint): void;
  /** The box being dragged, or null when the drag ends. */
  boxPreview(a: ScreenPoint | null, b: ScreenPoint | null): void;
  boxSelect(a: ScreenPoint, b: ScreenPoint): void;
  pan(from: ScreenPoint, to: ScreenPoint): void;
  zoom(factor: number, at: ScreenPoint): void;
  cancel(): void;
}

type Gesture =
  | { kind: "idle" }
  /** One pointer is down and has not moved far enough to mean anything yet. */
  | {
      kind: "press";
      pointerId: number;
      start: ScreenPoint;
      touch: boolean;
      held: boolean;
      timer: number;
    }
  | { kind: "box"; pointerId: number; start: ScreenPoint }
  | { kind: "pan"; pointerId: number; last: ScreenPoint; moved: boolean; orderOnRelease: boolean }
  | { kind: "pinch"; center: ScreenPoint; spread: number };

const MOUSE_SLOP = 4;
const TOUCH_SLOP = 24;
const DRAG_THRESHOLD = 8;
const LONG_PRESS_MS = 350;

/**
 * Mouse: left click taps, left drag boxes, right or middle drag pans, right
 * click orders, wheel zooms. Touch: tap taps, drag pans, hold then drag
 * boxes, pinch zooms and pans. Every intent is reachable by touch (U2).
 */
export function attachInput(element: HTMLElement, intents: Intents): () => void {
  const pointers = new Map<number, ScreenPoint>();
  let gesture: Gesture = { kind: "idle" };

  function locate(event: PointerEvent | WheelEvent): ScreenPoint {
    const bounds = element.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function reset(): void {
    if (gesture.kind === "press") clearTimeout(gesture.timer);
    if (gesture.kind === "box") intents.boxPreview(null, null);
    gesture = { kind: "idle" };
  }

  function pinchState(): { center: ScreenPoint; spread: number } {
    const [a, b] = [...pointers.values()];
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      spread: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  function onPointerDown(event: PointerEvent): void {
    const at = locate(event);
    pointers.set(event.pointerId, at);
    element.setPointerCapture(event.pointerId);
    const pointerId = event.pointerId;

    if (pointers.size === 2) {
      reset();
      gesture = { kind: "pinch", ...pinchState() };
    } else if (pointers.size > 2) {
      reset();
    } else if (event.pointerType === "mouse" && event.button !== 0) {
      gesture = {
        kind: "pan",
        pointerId,
        last: at,
        moved: false,
        orderOnRelease: event.button === 2,
      };
    } else {
      const touch = event.pointerType !== "mouse";
      const timer = window.setTimeout(() => {
        if (gesture.kind === "press" && gesture.pointerId === pointerId) gesture.held = true;
      }, LONG_PRESS_MS);
      gesture = { kind: "press", pointerId, start: at, touch, held: false, timer };
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) return;
    const at = locate(event);
    pointers.set(event.pointerId, at);

    if (gesture.kind === "pinch") {
      const next = pinchState();
      intents.pan(gesture.center, next.center);
      if (next.spread > 0 && gesture.spread > 0) {
        intents.zoom(gesture.spread / next.spread, next.center);
      }
      gesture = { kind: "pinch", ...next };
      return;
    }
    if (gesture.kind === "idle" || gesture.pointerId !== event.pointerId) return;

    if (gesture.kind === "press") {
      const { start, touch, held } = gesture;
      if (Math.hypot(at.x - start.x, at.y - start.y) < DRAG_THRESHOLD) return;
      clearTimeout(gesture.timer);
      gesture =
        touch && !held
          ? {
              kind: "pan",
              pointerId: event.pointerId,
              last: start,
              moved: true,
              orderOnRelease: false,
            }
          : { kind: "box", pointerId: event.pointerId, start };
    }
    if (gesture.kind === "box") {
      intents.boxPreview(gesture.start, at);
    } else if (gesture.kind === "pan") {
      if (Math.hypot(at.x - gesture.last.x, at.y - gesture.last.y) >= 1) gesture.moved = true;
      intents.pan(gesture.last, at);
      gesture.last = at;
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pointers.delete(event.pointerId)) return;
    const at = locate(event);
    const ended = gesture;
    const cancelled = event.type === "pointercancel";
    if (ended.kind === "pinch") {
      gesture = { kind: "idle" };
      return;
    }
    if (ended.kind === "idle" || ended.pointerId !== event.pointerId) return;
    reset();
    if (cancelled) return;
    if (ended.kind === "press") {
      intents.tap(at, ended.touch ? TOUCH_SLOP : MOUSE_SLOP);
    } else if (ended.kind === "box") {
      intents.boxSelect(ended.start, at);
    } else if (ended.orderOnRelease && !ended.moved) {
      intents.order(at);
    }
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    intents.zoom(Math.exp(event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), locate(event));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") intents.cancel();
  }

  function onContextMenu(event: Event): void {
    event.preventDefault();
  }

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerUp);
  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);

  return () => {
    reset();
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerUp);
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
  };
}
