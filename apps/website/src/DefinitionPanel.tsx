import type { Definition, Scenario } from "data";
import { addItem, freshId, removeItem, setItem } from "editor";
import { Button } from "./Hud.tsx";
import { NumberField, Panel, TextField, type Edit } from "./editorFields.tsx";
import { SELECT, useEditor } from "./store.ts";

/** What a definition gets when its weapon is switched on. */
const NEW_WEAPON = { damage: 5, range: 4, cooldown: 1 };

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
      {links("Trains", "produces")}
      {links("Builds", "builds")}
      <Button onClick={duplicate}>Duplicate</Button>
      <Button onClick={remove}>Delete</Button>
    </Panel>
  );
}
