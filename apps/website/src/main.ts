import "./style.css";
import { loadScenario } from "data";
import { createRenderer, type ScreenPoint } from "render";
import { createWorld } from "sim";
import { attachInput } from "./input.ts";
import { createGameLoop } from "./loop.ts";
import skirmish from "./scenarios/skirmish.json";

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const battlefield = element<HTMLDivElement>("battlefield");
const box = element<HTMLDivElement>("box");
const deselectButton = element<HTMLButtonElement>("deselect");
const debugButton = element<HTMLButtonElement>("toggle-debug");

const scenario = loadScenario(skirmish);
/** Until scenarios say who is human, the first player is. */
const localPlayerId = scenario.players[0].id;
const loop = createGameLoop(createWorld(scenario, 1));
const renderer = createRenderer(element("scene"), element("debug"), scenario);

let selectedIds: number[] = [];
let debug = false;

function select(ids: number[]): void {
  const owned = new Set(
    loop.current.units.filter((unit) => unit.playerId === localPlayerId).map((unit) => unit.id),
  );
  selectedIds = ids.filter((id) => owned.has(id));
  deselectButton.hidden = selectedIds.length === 0;
}

function order(at: ScreenPoint): void {
  const ground = renderer.pickGround(at);
  if (ground === null || selectedIds.length === 0) return;
  loop.submit({
    type: "move",
    playerId: localPlayerId,
    tick: loop.tick,
    unitIds: selectedIds,
    x: ground.x,
    y: ground.y,
  });
}

attachInput(battlefield, {
  tap(at, slop) {
    const id = renderer.pickUnit(at, slop);
    const unit = loop.current.units.find((candidate) => candidate.id === id);
    const selectable = unit?.playerId === localPlayerId && !selectedIds.includes(unit.id);
    if (selectable) select([unit.id]);
    else order(at);
  },
  order,
  boxPreview(a, b) {
    box.hidden = a === null || b === null;
    if (a === null || b === null) return;
    box.style.left = `${Math.min(a.x, b.x)}px`;
    box.style.top = `${Math.min(a.y, b.y)}px`;
    box.style.width = `${Math.abs(a.x - b.x)}px`;
    box.style.height = `${Math.abs(a.y - b.y)}px`;
  },
  boxSelect(a, b) {
    select(renderer.unitsInRect(a, b));
  },
  pan: (from, to) => renderer.pan(from, to),
  zoom: (factor, at) => renderer.zoom(factor, at),
  cancel() {
    select([]);
  },
});

deselectButton.addEventListener("click", () => select([]));
debugButton.addEventListener("click", () => {
  debug = !debug;
  debugButton.setAttribute("aria-pressed", String(debug));
});

function resize(): void {
  renderer.resize(
    battlefield.clientWidth,
    battlefield.clientHeight,
    Math.min(window.devicePixelRatio, 2),
  );
}
new ResizeObserver(resize).observe(battlefield);
resize();

let lastTime = performance.now();
function frame(time: number): void {
  const alpha = loop.advance((time - lastTime) / 1000);
  lastTime = time;
  renderer.draw(loop.previous, loop.current, alpha, { selectedIds, debug });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
