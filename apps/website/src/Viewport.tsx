import { useEffect, useRef } from "react";
import type { GameElements } from "./game.ts";

/** The canvases a battlefield draws on. `mount` returns its own teardown. */
export function Viewport({ mount }: { mount: (elements: GameElements) => () => void }) {
  const battlefield = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      mount({
        battlefield: battlefield.current!,
        scene: scene.current!,
        overlay: overlay.current!,
        box: box.current!,
      }),
    [mount],
  );

  return (
    <div ref={battlefield} className="battlefield fixed inset-0 touch-none select-none">
      <canvas ref={scene} className="absolute inset-0 size-full" />
      <canvas ref={overlay} className="pointer-events-none absolute inset-0 size-full" />
      <div
        ref={box}
        hidden
        className="pointer-events-none absolute border border-white bg-white/15"
      />
    </div>
  );
}
