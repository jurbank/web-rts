import type { Definition, Modifier, Scenario } from "data";
import { addItem, freshId, removeItem, setItem } from "editor";
import { Button } from "./Hud.tsx";
import { FIELD, NumberField, Panel, TextField, type Edit } from "./editorFields.tsx";
import { LOOKS } from "./factions.ts";
import { SELECT, useEditor } from "./store.ts";

/** What a definition gets when its weapon is switched on. */
const NEW_WEAPON = { damage: 5, range: 4, cooldown: 1 };

type Levels = NonNullable<Definition["levels"]>;

/** What a definition gets when its levels are switched on: three ranks of veterancy. */
const NEW_LEVELS: Levels = {
  thresholds: [50, 100, 200],
  credit: "killer",
  perLevel: [
    { stat: "damage", add: 2 },
    { stat: "maxHealth", add: 10 },
  ],
};

/** How far a death shares its experience when credit switches to nearby. */
const NEARBY_RANGE = 10;

const LEVEL_STATS: readonly [Modifier["stat"], string][] = [
  ["damage", "Damage"],
  ["maxHealth", "Health"],
  ["speed", "Speed"],
];

function Toggle(props: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" className="size-4" checked={props.checked} onChange={props.onChange} />
      {props.label}
    </label>
  );
}

/** Edits the definition the place tool holds. Every placement of it changes with it. */
export function DefinitionPanel(props: { document: Scenario; index: number; edit: Edit }) {
  const { document, index, edit } = props;
  const definition = document.definitions[index];
  const { weapon } = definition;
  const set = (patch: Partial<Definition>) =>
    edit(setItem("definitions", index, { ...definition, ...patch }));
  const setWeapon = (patch: Partial<NonNullable<Definition["weapon"]>>) =>
    set({ weapon: { ...NEW_WEAPON, ...weapon, ...patch } });
  const { levels } = definition;
  const setLevels = (patch: Partial<Levels>) =>
    set({ levels: { ...NEW_LEVELS, ...levels, ...patch } });
  const perLevel = (stat: Modifier["stat"]) =>
    (levels?.perLevel ?? [])
      .filter((modifier) => modifier.stat === stat)
      .reduce((sum, modifier) => sum + modifier.add, 0);
  /** One modifier per stat, and none for a stat that gains nothing. */
  const setPerLevel = (stat: Modifier["stat"], add: number) =>
    setLevels({
      perLevel: [
        ...(levels?.perLevel ?? []).filter((modifier) => modifier.stat !== stat),
        ...(add === 0 ? [] : [{ stat, add }]),
      ],
    });

  function duplicate(): void {
    const id = freshId(document.definitions, `${definition.id}-copy`);
    const copy = { ...definition, id, name: `${definition.name} copy` };
    if (edit(addItem("definitions", document.definitions.length, copy))) {
      useEditor.setState({ tool: { kind: "place", definitionId: id } });
    }
  }

  function remove(): void {
    if (edit(removeItem("definitions", index))) useEditor.setState({ tool: SELECT });
  }

  const links = (title: string, key: "produces" | "builds") => (
    <details>
      <summary className="cursor-pointer">
        {title} ({definition[key].length})
      </summary>
      <div className="flex flex-col gap-1 pt-1">
        {document.definitions.map(({ id, name }) => {
          const ids = definition[key];
          const checked = ids.includes(id);
          return (
            <Toggle
              key={id}
              label={name}
              checked={checked}
              onChange={() =>
                set({ [key]: checked ? ids.filter((other) => other !== id) : [...ids, id] })
              }
            />
          );
        })}
      </div>
    </details>
  );

  return (
    <Panel title={`Edit ${definition.id}`}>
      <TextField label="Name" value={definition.name} onCommit={(name) => set({ name })} />
      <TextField
        label="Color"
        value={definition.color ?? ""}
        placeholder="owner's"
        onCommit={(color) => set({ color: color === "" ? undefined : color })}
      />
      <label className="flex items-center justify-between gap-2">
        Look
        <select
          aria-label="Look"
          className={`${FIELD} w-32`}
          value={definition.look ?? ""}
          onChange={(event) =>
            set({ look: event.target.value === "" ? undefined : event.target.value })
          }
        >
          <option value="">Box</option>
          {[...new Set([...LOOKS, ...(definition.look ? [definition.look] : [])])].map((look) => (
            <option key={look} value={look}>
              {look}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Radius"
        value={definition.radius}
        onCommit={(radius) => set({ radius })}
      />
      <NumberField
        label="Health"
        value={definition.maxHealth}
        placeholder="none"
        onCommit={(maxHealth) => set({ maxHealth })}
        onClear={() => set({ maxHealth: undefined })}
      />
      <NumberField
        label="Speed"
        value={definition.speed}
        placeholder="static"
        onCommit={(speed) => set({ speed })}
        onClear={() => set({ speed: undefined })}
      />
      <NumberField
        label="Sight"
        value={definition.sight}
        placeholder="0"
        onCommit={(sight) => set({ sight })}
        onClear={() => set({ sight: undefined })}
      />
      <NumberField label="Cost" value={definition.cost} onCommit={(cost) => set({ cost })} />
      <NumberField
        label="Build time"
        value={definition.buildTime}
        onCommit={(buildTime) => set({ buildTime })}
      />
      <Toggle
        label="Weapon"
        checked={weapon !== undefined}
        onChange={() => set({ weapon: weapon === undefined ? NEW_WEAPON : undefined })}
      />
      {weapon !== undefined && (
        <>
          <NumberField
            label="Damage"
            value={weapon.damage}
            onCommit={(damage) => setWeapon({ damage })}
          />
          <NumberField
            label="Range"
            value={weapon.range}
            onCommit={(range) => setWeapon({ range })}
          />
          <NumberField
            label="Cooldown"
            value={weapon.cooldown}
            onCommit={(cooldown) => setWeapon({ cooldown })}
          />
          <NumberField
            label="Acquire range"
            value={weapon.acquireRange}
            placeholder="range"
            onCommit={(acquireRange) => setWeapon({ acquireRange })}
            onClear={() => setWeapon({ acquireRange: undefined })}
          />
        </>
      )}
      <NumberField
        label="Experience"
        value={definition.experience}
        onCommit={(experience) => set({ experience })}
      />
      <Toggle
        label="Levels"
        checked={levels !== undefined}
        onChange={() => set({ levels: levels === undefined ? NEW_LEVELS : undefined })}
      />
      {levels !== undefined && (
        <>
          <label className="flex items-center justify-between gap-2">
            Credit
            <select
              aria-label="Experience credit"
              className={`${FIELD} w-24`}
              value={levels.credit}
              onChange={(event) =>
                setLevels({
                  credit: event.target.value as Levels["credit"],
                  range: levels.range ?? NEARBY_RANGE,
                })
              }
            >
              <option value="killer">Killer</option>
              <option value="nearby">Nearby</option>
            </select>
          </label>
          {levels.credit === "nearby" && (
            <NumberField
              label="Share range"
              value={levels.range}
              onCommit={(range) => setLevels({ range })}
            />
          )}
          <TextField
            label="Thresholds"
            value={levels.thresholds.join(", ")}
            onCommit={(text) =>
              setLevels({ thresholds: text.split(",").map((part) => Number(part.trim())) })
            }
          />
          {LEVEL_STATS.map(([stat, label]) => (
            <NumberField
              key={stat}
              label={`${label} per level`}
              value={perLevel(stat)}
              onCommit={(add) => setPerLevel(stat, add)}
              onClear={() => setPerLevel(stat, 0)}
            />
          ))}
        </>
      )}
      {links("Trains", "produces")}
      {links("Builds", "builds")}
      <Button onClick={duplicate}>Duplicate</Button>
      <Button onClick={remove}>Delete</Button>
    </Panel>
  );
}
