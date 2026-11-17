import type { Scenario } from "data";
import { addItem, freshId, removeItem, renameGuide, setItem, type GuideList } from "editor";
import { Button } from "./Hud.tsx";
import { Chip, FIELD, NumberField, Panel, TextField, type Edit } from "./editorFields.tsx";
import { SELECT, useEditor, type GuideRef } from "./store.ts";

const LISTS = ["waypoints", "paths", "regions"] as const;

function pick(list: GuideList, index: number): void {
  useEditor.setState({ selection: [], guide: { list, index } });
}

/** Lists the scenario's waypoints, paths, and regions, and edits the selected one. */
export function GuidesPanel({ document, edit }: { document: Scenario; edit: Edit }) {
  const { guide, tool } = useEditor();
  const toggle = (kind: "waypoint" | "region") =>
    useEditor.setState({ tool: tool.kind === kind ? SELECT : { kind } });

  function newPath(): void {
    const selected = guide?.list === "waypoints" ? document.waypoints[guide.index] : undefined;
    const first = selected ?? document.waypoints.at(-1);
    if (first === undefined) return;
    const index = document.paths.length;
    const path = { id: freshId(document.paths, "path"), waypoints: [first.id] };
    if (edit(addItem("paths", index, path))) pick("paths", index);
  }

  return (
    <Panel title="Waypoints, paths, regions">
      <Button pressed={tool.kind === "waypoint"} onClick={() => toggle("waypoint")}>
        Add waypoints
      </Button>
      <Button pressed={tool.kind === "region"} onClick={() => toggle("region")}>
        Add region
      </Button>
      <Button disabled={document.waypoints.length === 0} onClick={newPath}>
        New path
      </Button>
      {LISTS.map(
        (list) =>
          document[list].length > 0 && (
            <div key={list} className="flex flex-col gap-1">
              <div className="text-white/60 capitalize">{list}</div>
              <div className="flex flex-wrap gap-1">
                {document[list].map((item, index) => (
                  <Chip
                    key={item.id}
                    pressed={guide?.list === list && guide.index === index}
                    onClick={() => pick(list, index)}
                  >
                    {item.id}
                  </Chip>
                ))}
              </div>
            </div>
          ),
      )}
      {guide !== null && document[guide.list][guide.index] !== undefined && (
        <GuideDetails
          key={`${guide.list}:${guide.index}`}
          document={document}
          guide={guide}
          edit={edit}
        />
      )}
    </Panel>
  );
}

function GuideDetails(props: { document: Scenario; guide: GuideRef; edit: Edit }) {
  const { document, edit } = props;
  const { list, index } = props.guide;
  const extending = useEditor((state) => state.tool.kind === "waypoint");
  const id = (
    <TextField
      label="Id"
      value={document[list][index].id}
      onCommit={(value) => edit(renameGuide(document, list, index, value))}
    />
  );
  const remove = (
    <Button
      onClick={() => {
        if (edit(removeItem(list, index))) useEditor.setState({ guide: null });
      }}
    >
      Delete
    </Button>
  );

  if (list === "waypoints") {
    const waypoint = document.waypoints[index];
    return (
      <>
        {id}
        {(["x", "y"] as const).map((key) => (
          <NumberField
            key={key}
            label={key.toUpperCase()}
            value={waypoint[key]}
            onCommit={(value) => edit(setItem("waypoints", index, { ...waypoint, [key]: value }))}
          />
        ))}
        {remove}
      </>
    );
  }

  if (list === "regions") {
    const region = document.regions[index];
    return (
      <>
        {id}
        {(["x", "y", "width", "height"] as const).map((key) => (
          <NumberField
            key={key}
            label={key === "x" || key === "y" ? key.toUpperCase() : key}
            value={region[key]}
            onCommit={(value) => edit(setItem("regions", index, { ...region, [key]: value }))}
          />
        ))}
        {remove}
      </>
    );
  }

  const path = document.paths[index];
  const setWaypoints = (waypoints: string[]) =>
    edit(setItem("paths", index, { ...path, waypoints }));
  return (
    <>
      {id}
      <ol className="flex flex-col gap-1">
        {path.waypoints.map((waypointId, at) => (
          <li key={at} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {at + 1}. {waypointId}
            </span>
            <Chip
              disabled={path.waypoints.length === 1}
              onClick={() => setWaypoints(path.waypoints.toSpliced(at, 1))}
            >
              Remove
            </Chip>
          </li>
        ))}
      </ol>
      <select
        aria-label="Add a waypoint to the path"
        className={FIELD}
        value=""
        onChange={(event) => setWaypoints([...path.waypoints, event.target.value])}
      >
        <option value="">Add existing waypoint…</option>
        {document.waypoints.map((waypoint) => (
          <option key={waypoint.id} value={waypoint.id}>
            {waypoint.id}
          </option>
        ))}
      </select>
      <div className="text-white/60">
        {extending
          ? "Click the map to extend this path."
          : "Turn on Add waypoints and click the map to extend this path."}
      </div>
      {remove}
    </>
  );
}
