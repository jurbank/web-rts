import { useState, type ReactNode, type RefObject } from "react";
import type { Game } from "./game.ts";
import { useHud } from "./store.ts";

const GROUP_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const ACTION_VERBS = { produce: "Train", build: "Build", research: "Research" };

const OUTCOMES = {
  won: "Victory",
  lost: "Defeat",
  draw: "Draw",
  defeated: "Defeated. Your team plays on",
  out: "Defeated. The game goes on",
};

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
  /** Conceding cannot be undone and costs teammates a player, so it takes a second tap. */
  const [confirming, setConfirming] = useState(false);

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
        {(view.placing !== null || view.targeting !== null || view.mode !== null) && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-900/85 py-1 pr-1 pl-3">
            <span>
              {view.notice ??
                (view.placing !== null
                  ? `Tap the ground to place ${view.placing}`
                  : view.mode === "attack"
                    ? "Tap an enemy, or the ground to attack along the way"
                    : view.mode === "patrol"
                      ? "Tap the ground to patrol to"
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
          {view.shop !== null && (
            <div className="flex flex-wrap gap-2">
              {view.shop.offers.map((offer) => (
                <Button
                  key={offer.slot}
                  disabled={!offer.enabled}
                  onClick={() =>
                    game.current?.buy(view.shop!.buildingId, offer.slot, offer.definitionId)
                  }
                >
                  Buy {offer.label} ({offer.cost})
                </Button>
              ))}
              {view.shop.abilities.map((ability) => (
                <Button
                  key={ability.id}
                  disabled={!ability.enabled}
                  onClick={() => game.current?.castOn(view.shop!.buildingId, ability.id)}
                >
                  {ability.label}
                  {ability.cost > 0 && ` (${ability.cost})`}
                </Button>
              ))}
            </div>
          )}
          {view.orders !== null && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!view.orders.attack}
                pressed={view.mode === "attack"}
                onClick={() => game.current?.shortcut({ kind: "attack" })}
              >
                Attack
              </Button>
              <Button
                disabled={!view.orders.patrol}
                pressed={view.mode === "patrol"}
                onClick={() => game.current?.shortcut({ kind: "patrol" })}
              >
                Patrol
              </Button>
              <Button
                disabled={!view.orders.hold}
                onClick={() => game.current?.shortcut({ kind: "hold" })}
              >
                Hold
              </Button>
              <Button
                disabled={!view.orders.stop}
                onClick={() => game.current?.shortcut({ kind: "stop" })}
              >
                Stop
              </Button>
              <Button
                pressed={view.queueing}
                onClick={() => game.current?.setQueueing(!view.queueing)}
              >
                Queue
              </Button>
            </div>
          )}
          {(view.groups.length > 0 || view.orders !== null) && (
            <div className="flex flex-wrap gap-2">
              {view.settingGroup
                ? GROUP_NUMBERS.map((number) => (
                    <Button
                      key={number}
                      onClick={() => game.current?.shortcut({ kind: "setGroup", number })}
                    >
                      {number}
                    </Button>
                  ))
                : view.groups.map((group) => (
                    <Button
                      key={group.number}
                      onClick={() =>
                        game.current?.shortcut({ kind: "selectGroup", number: group.number })
                      }
                    >
                      {group.number}: {group.count}
                    </Button>
                  ))}
              {view.orders !== null && (
                <Button
                  pressed={view.settingGroup}
                  onClick={() => game.current?.setGroupMode(!view.settingGroup)}
                >
                  Set group
                </Button>
              )}
            </div>
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
                key={action.kind + action.id}
                disabled={!action.enabled}
                onClick={() =>
                  action.kind === "produce"
                    ? game.current?.produce(action.id)
                    : action.kind === "research"
                      ? game.current?.research(action.id)
                      : game.current?.beginPlacement(action.id)
                }
              >
                {ACTION_VERBS[action.kind]} {action.label} ({action.cost})
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
          {view.outcome === null &&
            (confirming ? (
              <>
                <Button
                  onClick={() => {
                    game.current?.concede();
                    setConfirming(false);
                  }}
                >
                  Yes, concede
                </Button>
                <Button onClick={() => setConfirming(false)}>Keep playing</Button>
              </>
            ) : (
              <Button onClick={() => setConfirming(true)}>Concede</Button>
            ))}
          <Button onClick={onExit}>Editor</Button>
        </div>
      </div>
    </div>
  );
}
