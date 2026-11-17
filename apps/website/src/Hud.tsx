import type { ReactNode, RefObject } from "react";
import type { Game } from "./game.ts";
import { useHud } from "./store.ts";

const OUTCOMES = { won: "Victory", lost: "Defeat", draw: "Draw" };

export function Button(props: {
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.pressed}
      className="pointer-events-auto min-h-11 min-w-11 rounded-lg border border-white/30 bg-slate-900/85 px-3.5 text-white disabled:opacity-40 aria-pressed:bg-white aria-pressed:text-slate-900"
    >
      {props.children}
    </button>
  );
}

export function Hud({
  game,
  onRestart,
  onExit,
}: {
  game: RefObject<Game | null>;
  onRestart: () => void;
  onExit: () => void;
}) {
  const view = useHud((state) => state.view);
  const debug = useHud((state) => state.debug);
  const targeting = view.abilities.find((ability) => ability.id === view.targeting);

  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-sm text-white">
      <div className="flex items-start justify-between gap-2">
        <div className="flex gap-3 rounded-lg bg-slate-900/85 px-3 py-2 tabular-nums">
          <span>Resources {view.resources}</span>
          {view.counters.map((counter) => (
            <span key={counter.label}>
              {counter.label} {counter.value}
            </span>
          ))}
        </div>
        {(view.placing !== null || view.targeting !== null) && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-900/85 py-1 pr-1 pl-3">
            <span>
              {view.notice ??
                (view.placing !== null
                  ? `Tap the ground to place ${view.placing}`
                  : `Tap an enemy to use ${targeting?.label}`)}
            </span>
            <Button onClick={() => game.current?.cancelPlacement()}>Cancel</Button>
          </div>
        )}
      </div>

      {view.outcome !== null && (
        <div className="pointer-events-auto mx-auto flex flex-col items-center gap-3 rounded-xl bg-slate-900/90 px-8 py-6">
          <div className="text-2xl font-semibold">{OUTCOMES[view.outcome]}</div>
          <Button onClick={onRestart}>Restart</Button>
        </div>
      )}

      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col items-start gap-2">
          {view.queue.length > 0 && (
            <div className="rounded-lg bg-slate-900/85 px-3 py-2">
              {view.queue.map((item, index) => (
                <div key={index}>
                  {item.label} {index === 0 ? `${item.percent}%` : "queued"}
                </div>
              ))}
            </div>
          )}
          {view.selection !== null && (
            <div className="rounded-lg bg-slate-900/85 px-3 py-2">{view.selection}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {view.abilities.map((ability) => (
              <Button
                key={ability.id}
                disabled={!ability.enabled}
                pressed={view.targeting === ability.id}
                onClick={() => game.current?.cast(ability.id)}
              >
                {ability.label}
                {ability.cost > 0 && ` (${ability.cost})`}
                {ability.locked !== null
                  ? ` (level ${ability.locked})`
                  : ability.seconds > 0
                    ? ` ${ability.seconds}s`
                    : ""}
              </Button>
            ))}
            {view.actions.map((action) => (
              <Button
                key={action.kind + action.definitionId}
                disabled={!action.enabled}
                onClick={() =>
                  action.kind === "produce"
                    ? game.current?.produce(action.definitionId)
                    : game.current?.beginPlacement(action.definitionId)
                }
              >
                {action.kind === "produce" ? "Train" : "Build"} {action.label} ({action.cost})
              </Button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {view.selection !== null && (
            <Button onClick={() => game.current?.deselect()}>Deselect</Button>
          )}
          <Button pressed={debug} onClick={() => useHud.setState({ debug: !debug })}>
            Debug
          </Button>
          <Button onClick={onExit}>Editor</Button>
        </div>
      </div>
    </div>
  );
}
