import { create } from "zustand";
import { emptyHudView, type HudView } from "./hud.ts";

/** UI state only. World state stays in `sim` (U4). */
export const useHud = create<{ view: HudView; debug: boolean }>(() => ({
  view: emptyHudView,
  debug: false,
}));

/** What a tap on the editor's map does. */
export type Tool =
  | { kind: "select" }
  | { kind: "place"; definitionId: string }
  | { kind: "start"; playerId: string };

export const SELECT: Tool = { kind: "select" };

export interface EditorUi {
  /** Indexes into the document's placements. */
  selection: number[];
  tool: Tool;
  /** Who gets the placements the place tool adds. Null is nobody. */
  owner: string | null;
  /** The name the document is saved under. */
  name: string;
}

/** Editor-only state. It stays out of the document and its history (E4). */
export const useEditor = create<EditorUi>(() => ({
  selection: [],
  tool: SELECT,
  owner: null,
  name: "",
}));
