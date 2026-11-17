import type { Scenario } from "data";
import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, type Game, type GameElements } from "./game.ts";
import { emptyHudView } from "./hud.ts";
import { Hud } from "./Hud.tsx";
import { seatOnePerson } from "./seating.ts";
import { useHud } from "./store.ts";
import { Viewport } from "./Viewport.tsx";

export function Play({ scenario, onExit }: { scenario: Scenario; onExit: () => void }) {
  /** Bumping this throws the game away and starts a new one. */
  const [round, setRound] = useState(0);
  const game = useRef<Game | null>(null);
  const debug = useHud((state) => state.debug);

  const mount = useCallback(
    (elements: GameElements) => {
      const created = createGame(scenario, elements, (view) => useHud.setState({ view }), {
        ...seatOnePerson(scenario),
        // A new draw for each game, so shops and other rolls differ between playtests.
        seed: Math.floor(Math.random() * 0x7fffffff),
      });
      created.setDebug(useHud.getState().debug);
      game.current = created;
      return () => {
        created.dispose();
        game.current = null;
        useHud.setState({ view: emptyHudView });
      };
    },
    [scenario],
  );

  useEffect(() => {
    game.current?.setDebug(debug);
  }, [debug]);

  return (
    <>
      <Viewport key={round} mount={mount} />
      <Hud game={game} onRestart={() => setRound((value) => value + 1)} onExit={onExit} />
    </>
  );
}
