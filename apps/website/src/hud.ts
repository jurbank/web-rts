import type { CommandType, Definition, Scenario } from "data";
import type { EntitySnapshot, Snapshot } from "sim";

export interface HudAction {
  kind: "produce" | "build";
  definitionId: string;
  label: string;
  cost: number;
  enabled: boolean;
}

export interface HudAbility {
  id: string;
  label: string;
  /** Whole seconds until it is ready. */
  seconds: number;
  /** The level it unlocks at, or null once the caster has it. */
  locked: number | null;
  /** Resources it costs. */
  cost: number;
  /** Whether `sim` would take it now, apart from its target. */
  enabled: boolean;
}

export interface HudOffer {
  /** The slot it fills in the shop. */
  slot: number;
  definitionId: string;
  label: string;
  cost: number;
  enabled: boolean;
}

/** Everything the HUD shows. It changes only when one of these values does (U3). */
export interface HudView {
  resources: number;
  /** The scenario's labelled variables, then its running labelled timers in whole seconds left. */
  counters: { label: string; value: number }[];
  /** What the local player's first entity with offers has for sale, always on screen. */
  shop: { buildingId: number; offers: HudOffer[]; abilities: HudAbility[] } | null;
  selection: string | null;
  actions: HudAction[];
  /** What the one selected unit can cast. */
  abilities: HudAbility[];
  queue: { label: string; percent: number }[];
  /** The name of the building waiting to be placed. */
  placing: string | null;
  /** The id of the ability waiting for a target. */
  targeting: string | null;
  notice: string | null;
  /**
   * While the game goes on without the local player, `defeated` when a
   * teammate is still standing and `out` when none is.
   */
  outcome: "won" | "lost" | "draw" | "defeated" | "out" | null;
}

export const emptyHudView: HudView = {
  resources: 0,
  counters: [],
  shop: null,
  selection: null,
  actions: [],
  abilities: [],
  queue: [],
  placing: null,
  targeting: null,
  notice: null,
  outcome: null,
};

export interface HudInput {
  scenario: Scenario;
  snapshot: Snapshot;
  localPlayerId: string;
  selectedIds: readonly number[];
  placingId: string | null;
  /** The ability of the selected unit that is waiting for a target. */
  targetingId: string | null;
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
  const refused = (type: CommandType) => snapshot.refusedCommands.includes(type);
  const affordable = (id: string) => (definitions.get(id)?.cost ?? 0) <= resources;
  const action = (kind: HudAction["kind"], id: string): HudAction => {
    const cost = definitions.get(id)?.cost ?? 0;
    return {
      kind,
      definitionId: id,
      label: name(id),
      cost,
      enabled: affordable(id) && !refused(kind),
    };
  };
  const store = snapshot.entities.find(
    (entity) => entity.playerId === localPlayerId && entity.offers.length > 0,
  );

  const producer = selected.length === 1 && selected[0].built === 1 ? selected[0] : undefined;
  let actions = (producer === undefined ? [] : definitionOf(producer).produces).map((id) =>
    action("produce", id),
  );
  if (actions.length === 0) {
    const buildable = new Set(selected.flatMap((entity) => definitionOf(entity).builds));
    actions = [...buildable].map((id) => action("build", id));
  }

  const caster =
    selected.length === 1 && selected[0].playerId === localPlayerId ? selected[0] : null;
  const abilitiesOf = (entity: EntitySnapshot, self = false) =>
    definitionOf(entity).abilities.flatMap((ability, index): HudAbility[] =>
      self && ability.target !== "self"
        ? []
        : [
            {
              id: ability.id,
              label: ability.name,
              seconds: Math.ceil(entity.abilityCooldowns[index]),
              locked: entity.level < ability.level ? ability.level : null,
              cost: ability.cost,
              enabled: entity.abilityUsable[index] && !refused("cast"),
            },
          ],
    );
  const abilities = caster === null ? [] : abilitiesOf(caster);
  const local = snapshot.players.find((player) => player.id === localPlayerId);

  const { outcome } = snapshot;
  return {
    resources,
    counters: [
      ...scenario.variables.flatMap(({ id, label }) =>
        label === undefined ? [] : { label, value: snapshot.variables[id] },
      ),
      ...scenario.timers.flatMap(({ id, label }) => {
        const seconds = snapshot.timers[id];
        return label === undefined || seconds === null ? [] : { label, value: Math.ceil(seconds) };
      }),
    ],
    shop:
      store === undefined
        ? null
        : {
            buildingId: store.id,
            offers: store.offers.flatMap((id, slot) =>
              id === null
                ? []
                : {
                    slot,
                    definitionId: id,
                    label: name(id),
                    cost: definitions.get(id)?.cost ?? 0,
                    enabled: affordable(id) && !refused("produce"),
                  },
            ),
            abilities: abilitiesOf(store, true),
          },
    selection: describe(selected, definitionOf),
    actions,
    abilities,
    queue: (producer?.queue ?? []).map((item) => ({
      label: name(item.definitionId),
      percent: Math.floor(item.progress * 20) * 5,
    })),
    placing: placingId === null ? null : name(placingId),
    targeting: abilities.find((ability) => ability.id === input.targetingId)?.id ?? null,
    notice: input.notice,
    outcome:
      outcome !== null
        ? outcome.winningTeam === null
          ? "draw"
          : outcome.winningTeam === local?.team
            ? "won"
            : "lost"
        : local?.defeated !== true
          ? null
          : snapshot.players.some(
                (player) => player !== local && player.team === local.team && !player.defeated,
              )
            ? "defeated"
            : "out",
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
  if (definition.levels !== undefined) parts.push(`level ${entity.level}`);
  if (entity.health !== null && entity.maxHealth !== null) {
    parts.push(`${Math.ceil(entity.health)}/${entity.maxHealth}`);
  }
  if (entity.built < 1) parts.push(`building ${Math.floor(entity.built * 100)}%`);
  if (entity.carrying > 0) parts.push(`carrying ${entity.carrying}`);
  return parts.join(" · ");
}
