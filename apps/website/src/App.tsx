import { loadScenario } from "data";
import { useEffect, useRef, useState } from "react";
import { createGame, type Game } from "./game.ts";
import { emptyHudView } from "./hud.ts";
import { Hud } from "./Hud.tsx";
import skirmish from "./scenarios/skirmish.json";
import { useHud } from "./store.ts";

const scenario = loadScenario(skirmish);

export function App() {
  /** Bumping this throws the game away and starts a new one. */
  const [round, setRound] = useState(0);
  const battlefield = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const debug = useHud((state) => state.debug);

  useEffect(() => {
    const created = createGame(
      scenario,
      {
        battlefield: battlefield.current!,
        scene: scene.current!,
        overlay: overlay.current!,
        box: box.current!,
      },
      (view) => useHud.setState({ view }),
    );
    created.setDebug(useHud.getState().debug);
    game.current = created;
    return () => {
      created.dispose();
      game.current = null;
      useHud.setState({ view: emptyHudView });
    };
  }, [round]);

  useEffect(() => {
    game.current?.setDebug(debug);
  }, [debug]);

  return (
    <>
      <div
        ref={battlefield}
        className="battlefield fixed inset-0 touch-none select-none"
        key={round}
      >
        <canvas ref={scene} className="absolute inset-0 size-full" />
        <canvas ref={overlay} className="pointer-events-none absolute inset-0 size-full" />
        <div
          ref={box}
          hidden
          className="pointer-events-none absolute border border-white bg-white/15"
        />
      </div>
      <Hud game={game} onRestart={() => setRound((value) => value + 1)} />
    </>
  );
}
