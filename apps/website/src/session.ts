import type { Scenario } from "data";
import {
  applyEdit,
  createHistory,
  documentIssues,
  redo,
  removeItem,
  removePlacements,
  undo,
  type History,
  type Operation,
} from "editor";
import { useSyncExternalStore } from "react";
import { examples } from "./examples.ts";
import { SELECT, useEditor } from "./store.ts";

export interface SessionState {
  readonly history: History;
  /** The document as it was last saved or opened. */
  readonly saved: Scenario;
  /** Goes up each time a different document is opened. */
  readonly opened: number;
}

const MAX_ISSUES = 4;
const starter = examples[0].scenario;
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
  /**
   * Applies the edit unless the result would not load (C3). A refused edit
   * leaves a notice saying why. Returns whether it was applied.
   */
  edit(operation: Operation): boolean {
    const history = applyEdit(state.history, operation);
    const issues = documentIssues(history.document);
    const shown = issues.slice(0, MAX_ISSUES);
    if (issues.length > shown.length) shown.push(`and ${issues.length - shown.length} more`);
    useEditor.setState({
      notice: issues.length === 0 ? null : `That would break the scenario:\n${shown.join("\n")}`,
    });
    if (issues.length === 0) set({ ...state, history });
    return issues.length === 0;
  },
  // Undo and redo can remove items, so indexes and a tool that names one do not survive them.
  undo(): void {
    useEditor.setState({ selection: [], guide: null, tool: SELECT });
    set({ ...state, history: undo(state.history) });
  },
  redo(): void {
    useEditor.setState({ selection: [], guide: null, tool: SELECT });
    set({ ...state, history: redo(state.history) });
  },
  /** Replaces the document and forgets the history. */
  open(document: Scenario, name: string): void {
    useEditor.setState({
      selection: [],
      guide: null,
      tool: SELECT,
      owner: null,
      name,
      notice: null,
    });
    set({ history: createHistory(document), saved: document, opened: state.opened + 1 });
  },
  markSaved(document: Scenario): void {
    set({ ...state, saved: document });
  },
  deleteSelection(): void {
    const { selection, guide } = useEditor.getState();
    const operation =
      guide === null ? removePlacements(selection) : removeItem(guide.list, guide.index);
    if (session.edit(operation)) useEditor.setState({ selection: [], guide: null });
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state);
}
