import type { Scenario } from "data";
import { applyOperation, type Operation } from "./operations.ts";

/** Immutable. Each edit returns a new history. */
export interface History {
  readonly document: Scenario;
  /** Inverses of the edits made, oldest first. */
  readonly past: readonly Operation[];
  /** Inverses of the edits undone, oldest first. */
  readonly future: readonly Operation[];
}

export function createHistory(document: Scenario): History {
  return { document, past: [], future: [] };
}

/** Applies an edit. Anything that was undone can no longer be redone. */
export function applyEdit(history: History, operation: Operation): History {
  const { document, inverse } = applyOperation(history.document, operation);
  return { document, past: [...history.past, inverse], future: [] };
}

export function undo(history: History): History {
  const operation = history.past.at(-1);
  if (operation === undefined) return history;
  const { document, inverse } = applyOperation(history.document, operation);
  return { document, past: history.past.slice(0, -1), future: [...history.future, inverse] };
}

export function redo(history: History): History {
  const operation = history.future.at(-1);
  if (operation === undefined) return history;
  const { document, inverse } = applyOperation(history.document, operation);
  return { document, past: [...history.past, inverse], future: history.future.slice(0, -1) };
}
