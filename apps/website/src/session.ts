import { loadScenario, type Scenario } from "data";
import {
  applyEdit,
  createHistory,
  redo,
  removePlacements,
  undo,
  type History,
  type Operation,
} from "editor";
import { useSyncExternalStore } from "react";
import skirmish from "./scenarios/skirmish.json";
import { SELECT, useEditor } from "./store.ts";

export interface SessionState {
  readonly history: History;
  /** The document as it was last saved or opened. */
  readonly saved: Scenario;
  /** Goes up each time a different document is opened. */
  readonly opened: number;
}

const starter = loadScenario(skirmish);
let state: SessionState = { history: createHistory(starter), saved: starter, opened: 0 };
const listeners = new Set<() => void>();

function set(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The document being edited. It lives here and not in a store (U4), and it
 * outlives the editor screen so a playtest returns to it unchanged (E3).
 */
export const session = {
  get state(): SessionState {
    return state;
  },
  edit(operation: Operation): void {
    set({ ...state, history: applyEdit(state.history, operation) });
  },
  // Undo and redo can remove placements, so the selection's indexes do not survive them.
  undo(): void {
    useEditor.setState({ selection: [] });
    set({ ...state, history: undo(state.history) });
  },
  redo(): void {
    useEditor.setState({ selection: [] });
    set({ ...state, history: redo(state.history) });
  },
  /** Replaces the document and forgets the history. */
  open(document: Scenario, name: string): void {
    useEditor.setState({ selection: [], tool: SELECT, owner: null, name });
    set({ history: createHistory(document), saved: document, opened: state.opened + 1 });
  },
  markSaved(document: Scenario): void {
    set({ ...state, saved: document });
  },
  deleteSelection(): void {
    const { selection } = useEditor.getState();
    if (selection.length === 0) return;
    useEditor.setState({ selection: [] });
    session.edit(removePlacements(selection));
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state);
}
