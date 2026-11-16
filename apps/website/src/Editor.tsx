import type { Player, Scenario, Victory } from "data";
import { assignPlacements, blankDocument, parseDocument, serializeDocument } from "editor";
import { useEffect, useState, type ReactNode } from "react";
import { createEditorView } from "./editorView.ts";
import { Button } from "./Hud.tsx";
import { session, useSession } from "./session.ts";
import { createLocalStorage } from "./storage.ts";
import { SELECT, useEditor } from "./store.ts";
import { Viewport } from "./Viewport.tsx";

const storage = createLocalStorage(localStorage);

/** What a player gets when switched to ai, until the editor can edit these. */
const DEFAULT_AI = { workers: 5, attackSize: 5 };
const NEUTRAL = "-";
const MIXED = "?";

const FIELD =
  "pointer-events-auto min-h-9 min-w-0 rounded-md border border-white/30 bg-slate-800 px-2 text-white";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pointer-events-auto flex flex-col gap-2 rounded-lg bg-slate-900/85 p-2">
      <h2 className="text-xs tracking-wide text-white/60 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function OwnerSelect(props: {
  label: string;
  players: readonly Player[];
  /** A player id, null for nobody, or `MIXED`. */
  value: string | null;
  onChange: (playerId: string | null) => void;
}) {
  return (
    <select
      aria-label={props.label}
      className={FIELD}
      value={props.value ?? NEUTRAL}
      onChange={(event) =>
        props.onChange(event.target.value === NEUTRAL ? null : event.target.value)
      }
    >
      {props.value === MIXED && <option value={MIXED}>Mixed</option>}
      <option value={NEUTRAL}>Neutral</option>
      {props.players.map((player) => (
        <option key={player.id} value={player.id}>
          {player.id}
        </option>
      ))}
    </select>
  );
}

export function Editor({ onPlaytest }: { onPlaytest: (scenario: Scenario) => void }) {
  const { history, saved, opened } = useSession();
  const { selection, tool, owner, name } = useEditor();
  const document = history.document;
  const dirty = document !== saved;
  const [names, setNames] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [size, setSize] = useState(document.map);

  const report = (error: unknown) =>
    setNotice(error instanceof Error ? error.message : String(error));

  useEffect(() => {
    storage.list().then(setNames, report);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        session.deleteSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const mayDiscard = () => !dirty || window.confirm("Discard unsaved changes?");

  async function save(): Promise<void> {
    const serialized = serializeDocument(document);
    // Refuse to write a file that would not load (C3).
    parseDocument(serialized);
    await storage.save(name, serialized);
    session.markSaved(document);
    setNames(await storage.list());
    setNotice(`Saved "${name}"`);
  }

  async function load(target: string): Promise<void> {
    if (!mayDiscard()) return;
    const serialized = await storage.load(target);
    if (serialized === null) throw new Error(`No saved scenario "${target}"`);
    session.open(parseDocument(serialized), target);
    setNotice(`Loaded "${target}"`);
  }

  function create(): void {
    if (!mayDiscard()) return;
    session.open(blankDocument(document, size), "");
    setNotice(null);
  }

  /** The game gets a copy that went through the same load as a saved file (E3). */
  function playtest(): void {
    try {
      onPlaytest(parseDocument(serializeDocument(document)));
    } catch (error) {
      report(error);
    }
  }

  function setPlayer(index: number, player: Player): void {
    session.edit({ type: "setPlayer", index, player });
  }

  function setVictory(victory: Victory): void {
    session.edit({ type: "setVictory", victory });
  }

  const selected = selection.map((index) => document.placements[index]);
  const owners = new Set(selected.map((placement) => placement.playerId));
  const definitionName = (id: string) =>
    document.definitions.find((definition) => definition.id === id)?.name ?? id;
  const destructible = document.definitions.filter(
    (definition) => definition.maxHealth !== undefined,
  );
  const { victory } = document;

  return (
    <>
      <Viewport key={opened} mount={createEditorView} />
      <div className="pointer-events-none fixed inset-0 flex flex-col gap-2 p-3 text-sm text-white">
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Scenario name"
            placeholder="Scenario name"
            className={`${FIELD} w-40`}
            value={name}
            onChange={(event) => useEditor.setState({ name: event.target.value })}
          />
          <Button disabled={name.trim() === ""} onClick={() => save().catch(report)}>
            Save{dirty ? " *" : ""}
          </Button>
          <select
            aria-label="Load scenario"
            className={FIELD}
            value=""
            onChange={(event) => load(event.target.value).catch(report)}
          >
            <option value="">Load…</option>
            {names.map((saved) => (
              <option key={saved} value={saved}>
                {saved}
              </option>
            ))}
          </select>
          <Button disabled={history.past.length === 0} onClick={() => session.undo()}>
            Undo
          </Button>
          <Button disabled={history.future.length === 0} onClick={() => session.redo()}>
            Redo
          </Button>
          <div className="ml-auto">
            <Button onClick={playtest}>Playtest</Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-start justify-between gap-2">
          <div className="flex max-h-full w-44 flex-col gap-2 overflow-y-auto">
            <Panel title="Place">
              <Button
                pressed={tool.kind === "select"}
                onClick={() => useEditor.setState({ tool: SELECT })}
              >
                Select
              </Button>
              <OwnerSelect
                label="Owner of new objects"
                players={document.players}
                value={owner}
                onChange={(playerId) => useEditor.setState({ owner: playerId })}
              />
              {document.definitions.map((definition) => (
                <Button
                  key={definition.id}
                  pressed={tool.kind === "place" && tool.definitionId === definition.id}
                  onClick={() =>
                    useEditor.setState({ tool: { kind: "place", definitionId: definition.id } })
                  }
                >
                  {definition.name}
                </Button>
              ))}
            </Panel>
            <Panel title="New map">
              <div className="flex items-center gap-1">
                {(["width", "height"] as const).map((side) => (
                  <input
                    key={side}
                    aria-label={`Map ${side}`}
                    type="number"
                    min={8}
                    max={256}
                    className={`${FIELD} w-0 flex-1`}
                    value={size[side]}
                    onChange={(event) => setSize({ ...size, [side]: event.target.valueAsNumber })}
                  />
                ))}
              </div>
              <Button disabled={!(size.width >= 8 && size.height >= 8)} onClick={create}>
                Create
              </Button>
            </Panel>
          </div>

          <div className="flex max-h-full w-56 flex-col gap-2 overflow-y-auto">
            {selected.length > 0 && (
              <Panel title="Selection">
                <div>
                  {selected.length === 1
                    ? `${definitionName(selected[0].definitionId)} at ${selected[0].x}, ${selected[0].y}`
                    : `${selected.length} objects`}
                </div>
                <OwnerSelect
                  label="Owner of the selection"
                  players={document.players}
                  value={owners.size === 1 ? selected[0].playerId : MIXED}
                  onChange={(playerId) =>
                    session.edit(assignPlacements(document, selection, playerId))
                  }
                />
                <Button onClick={() => session.deleteSelection()}>Delete</Button>
              </Panel>
            )}
            <Panel title="Players">
              {document.players.map((player, index) => (
                <div key={player.id} className="flex items-center gap-1">
                  <span className="size-3 rounded-full" style={{ background: player.color }} />
                  <span className="flex-1 truncate">{player.id}</span>
                  <select
                    aria-label={`${player.id} controller`}
                    className={FIELD}
                    value={player.controller}
                    onChange={(event) =>
                      setPlayer(index, {
                        ...player,
                        controller: event.target.value as Player["controller"],
                        ai: player.ai ?? DEFAULT_AI,
                      })
                    }
                  >
                    <option value="human">Human</option>
                    <option value="ai">AI</option>
                  </select>
                  <Button
                    pressed={tool.kind === "start" && tool.playerId === player.id}
                    onClick={() =>
                      useEditor.setState({ tool: { kind: "start", playerId: player.id } })
                    }
                  >
                    Start
                  </Button>
                </div>
              ))}
            </Panel>
            <Panel title="Victory">
              <select
                aria-label="Victory condition"
                className={FIELD}
                value={victory.type}
                disabled={destructible.length === 0}
                onChange={(event) =>
                  setVictory(
                    event.target.value === "destroyAll"
                      ? { type: "destroyAll" }
                      : { type: "destroyDefinitions", definitionIds: [destructible[0].id] },
                  )
                }
              >
                <option value="destroyAll">Destroy everything</option>
                <option value="destroyDefinitions">Destroy all of…</option>
              </select>
              {victory.type === "destroyDefinitions" &&
                destructible.map(({ id, name }) => {
                  const ids = victory.definitionIds;
                  const checked = ids.includes(id);
                  return (
                    <label key={id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="pointer-events-auto size-4"
                        checked={checked}
                        disabled={checked && ids.length === 1}
                        onChange={() =>
                          setVictory({
                            type: "destroyDefinitions",
                            definitionIds: checked
                              ? ids.filter((other) => other !== id)
                              : [...ids, id],
                          })
                        }
                      />
                      {name}
                    </label>
                  );
                })}
            </Panel>
          </div>
        </div>

        {notice !== null && (
          <div className="pointer-events-auto mx-auto max-w-xl rounded-lg bg-slate-900/85 px-3 py-2 whitespace-pre-wrap">
            {notice}
          </div>
        )}
      </div>
    </>
  );
}
