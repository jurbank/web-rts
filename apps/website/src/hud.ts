import type { Definition, Scenario } from "data";
import type { EntitySnapshot, Snapshot } from "sim";

export interface HudAction {
  kind: "produce" | "build";
  definitionId: string;
  label: string;
  cost: number;
  enabled: boolean;
}

/** Everything the HUD shows. It changes only when one of these values does (U3). */
export interface HudView {
  resources: number;
  /** The scenario's labelled variables, in scenario order. */
  counters: { label: string; value: number }[];
  selection: string | null;
  actions: HudAction[];
  queue: { label: string; percent: number }[];
  /** The name of the building waiting to be placed. */
  placing: string | null;
  notice: string | null;
  outcome: "won" | "lost" | "draw" | null;
}

export const emptyHudView: HudView = {
  resources: 0,
  counters: [],
  selection: null,
  actions: [],
  queue: [],
  placing: null,
  notice: null,
  outcome: null,
};

export interface HudInput {
  scenario: Scenario;
  snapshot: Snapshot;
  localPlayerId: string;
  selectedIds: readonly number[];
  placingId: string | null;
  notice: string | null;
}

export function buildHudView(input: HudInput): HudView {
  const { scenario, snapshot, localPlayerId, placingId } = input;
  const definitions = new Map(
    scenario.definitions.map((definition) => [definition.id, definition]),
  );
  const definitionOf = (entity: EntitySnapshot) => definitions.get(entity.definitionId)!;
  const name = (id: string) => definitions.get(id)?.name ?? id;
  const resources = snapshot.players.find((player) => player.id === localPlayerId)?.resources ?? 0;
  const selected = snapshot.entities.filter((entity) => input.selectedIds.includes(entity.id));
  const action = (kind: HudAction["kind"], id: string): HudAction => {
    const cost = definitions.get(id)?.cost ?? 0;
    return { kind, definitionId: id, label: name(id), cost, enabled: cost <= resources };
  };

  const producer = selected.length === 1 && selected[0].built === 1 ? selected[0] : undefined;
  let actions = (producer === undefined ? [] : definitionOf(producer).produces).map((id) =>
    action("produce", id),
  );
  if (actions.length === 0) {
    const buildable = new Set(selected.flatMap((entity) => definitionOf(entity).builds));
    actions = [...buildable].map((id) => action("build", id));
  }

  const { outcome } = snapshot;
  return {
    resources,
    counters: scenario.variables.flatMap(({ id, label }) =>
      label === undefined ? [] : { label, value: snapshot.variables[id] },
    ),
    selection: describe(selected, definitionOf),
    actions,
    queue: (producer?.queue ?? []).map((item) => ({
      label: name(item.definitionId),
      percent: Math.floor(item.progress * 20) * 5,
    })),
    placing: placingId === null ? null : name(placingId),
    notice: input.notice,
    outcome:
      outcome === null
        ? null
        : outcome.winnerId === null
          ? "draw"
          : outcome.winnerId === localPlayerId
            ? "won"
            : "lost",
  };
}

function describe(
  selected: readonly EntitySnapshot[],
  definitionOf: (entity: EntitySnapshot) => Definition,
): string | null {
  if (selected.length === 0) return null;
  if (selected.length > 1) return `${selected.length} units`;
  const [entity] = selected;
  const definition = definitionOf(entity);
  const parts = [definition.name];
  if (entity.health !== null && definition.maxHealth !== undefined) {
    parts.push(`${Math.ceil(entity.health)}/${definition.maxHealth}`);
  }
  if (entity.built < 1) parts.push(`building ${Math.floor(entity.built * 100)}%`);
  if (entity.carrying > 0) parts.push(`carrying ${entity.carrying}`);
  return parts.join(" · ");
}
