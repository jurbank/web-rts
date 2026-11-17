import { TRIGGERING, type Scenario, type Trigger } from "data";
import { addItem, removeItem, setItem, type Operation } from "./operations.ts";

/** The trigger the editor's victory control reads and writes. */
export const VICTORY_TRIGGER = "victory";

/**
 * A player is defeated when an entity of theirs dies and none of the listed
 * definitions, or nothing at all for `destroyAll`, is left to them.
 */
export type Victory =
  | { type: "destroyAll" }
  | { type: "destroyDefinitions"; definitionIds: string[] };

export function victoryTrigger(victory: Victory): Trigger {
  const filter = victory.type === "destroyAll" ? {} : { definitionIds: victory.definitionIds };
  return {
    id: VICTORY_TRIGGER,
    event: { type: "died", ...filter },
    conditions: [{ type: "count", playerId: TRIGGERING, ...filter, op: "==", value: 0 }],
    actions: [{ type: "defeat", playerId: TRIGGERING }],
  };
}

/**
 * The victory condition the document's victory trigger expresses. Null when
 * there is no such trigger, and "custom" when it says something else.
 */
export function readVictory(document: Scenario): Victory | "custom" | null {
  const trigger = document.triggers.find(({ id }) => id === VICTORY_TRIGGER);
  if (trigger === undefined) return null;
  if (trigger.event.type !== "died") return "custom";
  const { definitionIds } = trigger.event;
  const victory: Victory =
    definitionIds === undefined
      ? { type: "destroyAll" }
      : { type: "destroyDefinitions", definitionIds };
  return JSON.stringify(trigger) === JSON.stringify(victoryTrigger(victory)) ? victory : "custom";
}

/** Writes the victory trigger, or removes it for null. */
export function setVictory(document: Scenario, victory: Victory | null): Operation {
  const index = document.triggers.findIndex(({ id }) => id === VICTORY_TRIGGER);
  if (victory === null) {
    return index === -1 ? { type: "batch", operations: [] } : removeItem("triggers", index);
  }
  const trigger = victoryTrigger(victory);
  return index === -1
    ? addItem("triggers", document.triggers.length, trigger)
    : setItem("triggers", index, trigger);
}
