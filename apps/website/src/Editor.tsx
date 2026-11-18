import { definitionSchema, type Player, type Scenario } from "data";
import {
  addItem,
  assignPlacements,
  blankDocument,
  freshId,
  parseDocument,
  readVictory,
  removeItem,
  serializeDocument,
  setItem,
  setVictory,
  VICTORY_TRIGGER,
  type Victory,
} from "editor";
import { useEffect, useState } from "react";
import { DefinitionPanel } from "./DefinitionPanel.tsx";
import { FIELD, Panel, TextField, type Edit } from "./editorFields.tsx";
import { createEditorView } from "./editorView.ts";
import { examples } from "./examples.ts";
import { GuidesPanel } from "./GuidesPanel.tsx";
import { Button } from "./Hud.tsx";
import { session, useSession } from "./session.ts";
import { createLocalStorage } from "./storage.ts";
import { SELECT, useEditor } from "./store.ts";
import { Viewport } from "./Viewport.tsx";

const storage = createLocalStorage(localStorage);

/** What a player gets when switched to ai, until the editor can edit these. */
const DEFAULT_AI = { workers: 5, attackSize: 5 };
/** Colors a new player takes, the first one nobody has yet. Enough for twelve seats. */
const PLAYER_COLORS = [
  "#e5484d",
  "#3e63dd",
  "#30a46c",
  "#f76b15",
  "#8e4ec6",
  "#ffc53d",
  "#12a594",
  "#d6409f",
  "#8d8d8d",
  "#0090ff",
  "#a18072",
  "#bdee63",
];
const NEUTRAL = "-";
const MIXED = "?";

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
  const { selection, tool, owner, name, notice } = useEditor();
  const document = history.document;
  const dirty = document !== saved;
  const [names, setNames] = useState<string[]>([]);
  const setNotice = (notice: string | null) => useEditor.setState({ notice });
  const [size, setSize] = useState(document.map);

  const report = (error: unknown) =>
    setNotice(error instanceof Error ? error.message : String(error));

  const edit: Edit = (operation) => session.edit(operation);

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

  function openExample(index: number): void {
    if (!mayDiscard()) return;
    const { name: title, scenario } = examples[index];
    session.open(scenario, "");
    setNotice(`Opened the ${title} example`);
  }

  function create(): void {
    if (!mayDiscard()) return;
    session.open(blankDocument(document, size), "");
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
    edit(setItem("players", index, player));
  }

  /** Switching to the ai gives it settings. Other seats keep whatever they had. */
  function setController(index: number, controller: Player["controller"]): void {
    const player = { ...document.players[index], controller };
    if (controller === "ai") player.ai ??= DEFAULT_AI;
    setPlayer(index, player);
  }

  /** A human seat with ai settings gets the ai when no person takes it. */
  function setFill(index: number, fill: boolean): void {
    const player = { ...document.players[index] };
    if (fill) player.ai ??= DEFAULT_AI;
    else delete player.ai;
    setPlayer(index, player);
  }

  function setTeam(index: number, team: string): void {
    const player = { ...document.players[index] };
    if (team === "") delete player.team;
    else player.team = team;
    setPlayer(index, player);
  }

  function addPlayer(): void {
    const taken = new Set(document.players.map((player) => player.color.toLowerCase()));
    const player: Player = {
      id: freshId(document.players, "player"),
      color: PLAYER_COLORS.find((color) => !taken.has(color)) ?? PLAYER_COLORS[0],
      controller: "ai",
      resources: 0,
      ai: DEFAULT_AI,
    };
    edit(addItem("players", document.players.length, player));
  }

  /** Refused while anything still names the player, such as a placement or a trigger. */
  function removePlayer(index: number): void {
    if (edit(removeItem("players", index))) useEditor.setState({ tool: SELECT });
  }

  function chooseVictory(victory: Victory | null): void {
    edit(setVictory(document, victory));
  }

  function newDefinition(): void {
    const id = freshId(document.definitions, "unit");
    const definition = definitionSchema.parse({
      id,
      name: "New unit",
      radius: 0.5,
      maxHealth: 50,
      speed: 3,
    });
    if (edit(addItem("definitions", document.definitions.length, definition))) {
      useEditor.setState({ tool: { kind: "place", definitionId: id } });
    }
  }

  const selected = selection.map((index) => document.placements[index]);
  const owners = new Set(selected.map((placement) => placement.playerId));
  const definitionName = (id: string) =>
    document.definitions.find((definition) => definition.id === id)?.name ?? id;
  const destructible = document.definitions.filter(
    (definition) => definition.maxHealth !== undefined,
  );
  const editing =
    tool.kind === "place"
      ? document.definitions.findIndex(({ id }) => id === tool.definitionId)
      : -1;
  const victory = readVictory(document);
  const otherTriggers = document.triggers.filter(({ id }) => id !== VICTORY_TRIGGER).length;

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
            onChange={(event) => {
              const [kind, value] = event.target.value.split(/:(.*)/s);
              if (kind === "example") openExample(Number(value));
              else load(value).catch(report);
            }}
          >
            <option value="">Load…</option>
            {names.length > 0 && (
              <optgroup label="Saved">
                {names.map((saved) => (
                  <option key={saved} value={`saved:${saved}`}>
                    {saved}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Examples">
              {examples.map((example, index) => (
                <option key={example.name} value={`example:${index}`}>
                  {example.name}
                </option>
              ))}
            </optgroup>
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
          <div className="flex max-h-full w-52 flex-col gap-2 overflow-y-auto">
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
              <Button onClick={newDefinition}>New unit type</Button>
            </Panel>
            <GuidesPanel document={document} edit={edit} />
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
                  onChange={(playerId) => edit(assignPlacements(document, selection, playerId))}
                />
                <Button onClick={() => session.deleteSelection()}>Delete</Button>
              </Panel>
            )}
            {editing >= 0 && (
              <DefinitionPanel
                key={document.definitions[editing].id}
                document={document}
                index={editing}
                edit={edit}
              />
            )}
            <Panel title="Visibility">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={document.fogOfWar}
                  onChange={(event) => edit({ type: "setFogOfWar", enabled: event.target.checked })}
                />
                Fog of war
              </label>
            </Panel>
            <Panel title="Players">
              {document.players.map((player, index) => (
                <div key={player.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="size-3 rounded-full" style={{ background: player.color }} />
                    <span className="flex-1 truncate">{player.id}</span>
                    <Button
                      disabled={document.players.length === 1}
                      onClick={() => removePlayer(index)}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      aria-label={`${player.id} controller`}
                      className={`${FIELD} flex-1`}
                      value={player.controller}
                      onChange={(event) =>
                        setController(index, event.target.value as Player["controller"])
                      }
                    >
                      <option value="human">Human</option>
                      <option value="ai">AI</option>
                      <option value="none">Nobody</option>
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
                  <TextField
                    label="Team"
                    value={player.team ?? ""}
                    placeholder="Own team"
                    onCommit={(team) => setTeam(index, team)}
                  />
                  {player.controller === "human" && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={player.ai !== undefined}
                        onChange={(event) => setFill(index, event.target.checked)}
                      />
                      AI plays if nobody takes it
                    </label>
                  )}
                </div>
              ))}
              <Button onClick={addPlayer}>Add player</Button>
            </Panel>
            <Panel title="Victory">
              <select
                aria-label="Victory condition"
                className={FIELD}
                value={victory === null ? "none" : victory === "custom" ? "custom" : victory.type}
                disabled={destructible.length === 0}
                onChange={(event) =>
                  chooseVictory(
                    event.target.value === "none"
                      ? null
                      : event.target.value === "destroyAll"
                        ? { type: "destroyAll" }
                        : { type: "destroyDefinitions", definitionIds: [destructible[0].id] },
                  )
                }
              >
                {victory === "custom" && (
                  <option value="custom" disabled>
                    Custom trigger
                  </option>
                )}
                <option value="none">No one is eliminated</option>
                <option value="destroyAll">Destroy everything</option>
                <option value="destroyDefinitions">Destroy all of…</option>
              </select>
              {victory !== null &&
                victory !== "custom" &&
                victory.type === "destroyDefinitions" &&
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
                          chooseVictory({
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
              {otherTriggers > 0 && (
                <div className="text-white/60">
                  {otherTriggers} more {otherTriggers === 1 ? "trigger" : "triggers"} in this
                  scenario
                </div>
              )}
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
