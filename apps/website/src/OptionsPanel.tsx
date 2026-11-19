import { RANDOM_CHOICE, type Option, type Scenario } from "data";
import { addItem, freshId, removeItem, setItem } from "editor";
import { Button } from "./Hud.tsx";
import { FIELD, Panel, TextField, type Edit } from "./editorFields.tsx";

/**
 * The choices players make before a match. An option whose choices are all unit
 * types can decide what a placement starts as. Edits that would not load are refused.
 */
export function OptionsPanel({ document, edit }: { document: Scenario; edit: Edit }) {
  function addOption(): void {
    const option: Option = {
      id: freshId(document.options, "option"),
      name: "New option",
      scope: "player",
      choices: [{ id: "choice", name: "Choice" }],
    };
    edit(addItem("options", document.options.length, option));
  }

  return (
    <Panel title="Setup options">
      {document.options.map((option, index) => (
        <OptionEditor
          key={option.id}
          document={document}
          option={option}
          set={(patch) => edit(setItem("options", index, { ...option, ...patch }))}
          remove={() => edit(removeItem("options", index))}
        />
      ))}
      <Button onClick={addOption}>Add option</Button>
    </Panel>
  );
}

function OptionEditor(props: {
  document: Scenario;
  option: Option;
  set: (patch: Partial<Option>) => boolean;
  remove: () => boolean;
}) {
  const { document, option, set } = props;
  const { choices } = option;
  const unused = document.definitions.filter(
    ({ id }) => !choices.some((choice) => choice.id === id),
  );
  const setChoices = (next: Option["choices"]) =>
    set({
      choices: next,
      // A default that names a removed choice falls back to the first.
      ...(option.default !== undefined &&
        option.default !== RANDOM_CHOICE &&
        !next.some(({ id }) => id === option.default) && { default: undefined }),
    });

  return (
    <details className="flex flex-col gap-1">
      <summary className="cursor-pointer">{option.name}</summary>
      <div className="flex flex-col gap-1 pt-1">
        <TextField label="Name" value={option.name} onCommit={(name) => set({ name })} />
        <label className="flex items-center justify-between gap-2">
          Asks
          <select
            aria-label={`${option.name} asks`}
            className={`${FIELD} w-28`}
            value={option.scope}
            onChange={(event) => set({ scope: event.target.value as Option["scope"] })}
          >
            <option value="player">Each player</option>
            <option value="match">The match</option>
          </select>
        </label>
        {choices.map((choice, index) => (
          // Keyed by name too, so undo shows the restored name.
          <div key={`${choice.id}:${choice.name}`} className="flex items-center gap-1">
            <input
              aria-label={`Choice ${choice.id} name`}
              className={`${FIELD} w-0 flex-1`}
              defaultValue={choice.name}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name !== choice.name) setChoices(choices.with(index, { ...choice, name }));
              }}
            />
            <Button
              disabled={choices.length === 1}
              onClick={() => setChoices(choices.toSpliced(index, 1))}
            >
              Remove
            </Button>
          </div>
        ))}
        <select
          aria-label={`Add a choice to ${option.name}`}
          className={FIELD}
          value=""
          onChange={(event) => {
            const id = event.target.value;
            const definition = document.definitions.find((candidate) => candidate.id === id);
            const choice =
              definition === undefined
                ? { id: freshId(choices, "choice"), name: `Choice ${choices.length + 1}` }
                : { id: definition.id, name: definition.name };
            setChoices([...choices, choice]);
          }}
        >
          <option value="">Add a choice…</option>
          <option value="-">A named choice</option>
          {unused.length > 0 && (
            <optgroup label="Unit types">
              {unused.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <label className="flex items-center justify-between gap-2">
          Default
          <select
            aria-label={`${option.name} default`}
            className={`${FIELD} w-28`}
            value={option.default ?? choices[0].id}
            onChange={(event) => set({ default: event.target.value })}
          >
            {choices.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            <option value={RANDOM_CHOICE}>Random</option>
          </select>
        </label>
        <Button onClick={props.remove}>Delete option</Button>
      </div>
    </details>
  );
}
