import type { GuideList } from "editor";
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
  | { kind: "start"; playerId: string }
  /** Adds a waypoint, and appends it to the selected path if there is one. */
  | { kind: "waypoint" }
  | { kind: "region" };

export const SELECT: Tool = { kind: "select" };

/** A waypoint, path, or region of the document. */
export interface GuideRef {
  list: GuideList;
  index: number;
}

export interface EditorUi {
  /** Indexes into the document's placements. */
  selection: number[];
  /** The selected guide. Selecting placements clears it, and the other way round. */
  guide: GuideRef | null;
  tool: Tool;
  /** Who gets the placements the place tool adds. Null is nobody. */
  owner: string | null;
  /** The name the document is saved under. */
  name: string;
  /** The last thing the editor has to tell the user, such as why an edit was refused. */
  notice: string | null;
}

/** Editor-only state. It stays out of the document and its history (E4). */
export const useEditor = create<EditorUi>(() => ({
  selection: [],
  guide: null,
  tool: SELECT,
  owner: null,
  name: "",
  notice: null,
}));
