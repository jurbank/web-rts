import { create } from "zustand";
import { emptyHudView, type HudView } from "./hud.ts";

/** UI state only. World state stays in `sim` (U4). */
export const useHud = create<{ view: HudView; debug: boolean }>(() => ({
  view: emptyHudView,
  debug: false,
}));
