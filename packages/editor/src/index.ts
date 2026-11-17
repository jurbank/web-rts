export { blankDocument, parseDocument, serializeDocument } from "./document.ts";
export { applyEdit, createHistory, redo, undo, type History } from "./history.ts";
export {
  addItem,
  applyOperation,
  assignPlacements,
  documentIssues,
  freshId,
  moveGuide,
  movePlacements,
  removeItem,
  removePlacements,
  renameGuide,
  setItem,
  type GuideList,
  type Operation,
} from "./operations.ts";
export {
  readVictory,
  setVictory,
  VICTORY_TRIGGER,
  victoryTrigger,
  type Victory,
} from "./victory.ts";
