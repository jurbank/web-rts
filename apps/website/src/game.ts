import type { Scenario } from "data";
import { createRenderer, type ScreenPoint } from "render";
import { createWorld, type Command, type EntitySnapshot } from "sim";
import { scenarioGuides } from "./guides.ts";
import { buildHudView, type HudView } from "./hud.ts";
import { attachInput, showBox } from "./input.ts";
import { createGameLoop } from "./loop.ts";

export interface GameElements {
  battlefield: HTMLElement;
  scene: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  box: HTMLElement;
}

/** What the HUD can ask of a running game. */
export interface Game {
  produce(definitionId: string): void;
  /** Buys the offer in a shop's slot, whatever is selected. */
  buy(buildingId: number, slot: number, definitionId: string): void;
  /** Uses an ability of an entity that needs no target, whatever is selected. */
  castOn(unitId: number, abilityId: string): void;
  /** Uses an ability of the selected unit. One that needs an enemy waits for the next tap. */
  cast(abilityId: string): void;
  /** The next tap on the ground places this building. */
  beginPlacement(definitionId: string): void;
  cancelPlacement(): void;
  deselect(): void;
  setDebug(debug: boolean): void;
  dispose(): void;
}

type OrderFields<T> = T extends Command ? Omit<T, "playerId" | "tick"> : never;

export function createGame(
  scenario: Scenario,
  elements: GameElements,
  onView: (view: HudView) => void,
): Game {
  /** Until scenarios say which seat is ours, the first human player is. */
  const localPlayer =
    scenario.players.find((player) => player.controller === "human") ??
    scenario.players.find((player) => player.controller !== "none") ??
    scenario.players[0];
  const localPlayerId = localPlayer.id;
  const definitions = new Map(
    scenario.definitions.map((definition) => [definition.id, definition]),
  );
  const loop = createGameLoop(createWorld(scenario, 1));
  const renderer = createRenderer(elements.scene, elements.overlay, scenario);
  const guides = scenarioGuides(scenario);

  const home =
    localPlayer.start ?? loop.current.entities.find((entity) => entity.playerId === localPlayerId);
  if (home !== undefined) renderer.focus(home);

  let selectedIds: number[] = [];
  let placingId: string | null = null;
  let targetingId: string | null = null;
  let notice: string | null = null;
  let debug = false;
  let lastView = "";

  const definitionOf = (entity: EntitySnapshot) => definitions.get(entity.definitionId)!;
  const isOwn = (entity: EntitySnapshot) => entity.playerId === localPlayerId;
  const teams = new Map(loop.current.players.map((player) => [player.id, player.team]));
  const isHostile = (entity: EntitySnapshot) =>
    entity.playerId !== null &&
    entity.health !== null &&
    teams.get(entity.playerId) !== teams.get(localPlayerId);
  const selected = () => loop.current.entities.filter((entity) => selectedIds.includes(entity.id));

  function submit(order: OrderFields<Command>): void {
    loop.submit({ ...order, playerId: localPlayerId, tick: loop.tick } as Command);
    notice = null;
  }

  function select(ids: number[]): void {
    selectedIds = ids;
    placingId = null;
    targetingId = null;
    notice = null;
  }

  function place(at: ScreenPoint): void {
    const definition = definitions.get(placingId!)!;
    const ground = renderer.pickGround(at);
    if (ground === null || !loop.canPlace(definition, ground.x, ground.y)) {
      notice = `${definition.name} does not fit there`;
      return;
    }
    submit({ type: "build", unitIds: selectedIds, definitionId: definition.id, ...ground });
    placingId = null;
  }

  /** Works out what a press on the battlefield means for the current selection. */
  function act(at: ScreenPoint, slop: number, maySelect: boolean): void {
    if (placingId !== null) {
      place(at);
      return;
    }
    const id = renderer.pickEntity(at, slop);
    const entity = loop.current.entities.find((candidate) => candidate.id === id);
    if (targetingId !== null) {
      if (entity === undefined || !isHostile(entity)) {
        notice = "That is not an enemy";
        return;
      }
      submit({ type: "cast", unitId: selectedIds[0], abilityId: targetingId, targetId: entity.id });
      targetingId = null;
      return;
    }
    const units = selected().filter(
      (unit) => isOwn(unit) && definitionOf(unit).speed !== undefined,
    );
    const unitIds = units.map((unit) => unit.id);

    if (entity !== undefined && isOwn(entity)) {
      const canAssist =
        entity.built < 1 &&
        units.some((unit) => definitionOf(unit).builds.includes(entity.definitionId));
      if (canAssist) {
        submit({ type: "assist", unitIds, buildingId: entity.id });
        return;
      }
      if (maySelect && !selectedIds.includes(entity.id)) {
        select([entity.id]);
        return;
      }
    }
    if (unitIds.length === 0) return;
    if (entity !== undefined && isHostile(entity)) {
      submit({ type: "attack", unitIds, targetId: entity.id });
    } else if (entity !== undefined && definitionOf(entity).resource !== undefined) {
      submit({ type: "gather", unitIds, nodeId: entity.id });
    } else {
      const ground = renderer.pickGround(at);
      if (ground !== null) submit({ type: "move", unitIds, ...ground });
    }
  }

  const detachInput = attachInput(elements.battlefield, {
    tap: (at, slop) => act(at, slop, true),
    order: (at) => act(at, 0, false),
    boxPreview: (a, b) => showBox(elements.box, a, b),
    boxSelect(a, b) {
      const inside = renderer.entitiesInRect(a, b);
      select(
        loop.current.entities
          .filter(
            (entity) =>
              inside.includes(entity.id) &&
              isOwn(entity) &&
              definitionOf(entity).speed !== undefined,
          )
          .map((entity) => entity.id),
      );
    },
    pan: (from, to) => renderer.pan(from, to),
    zoom: (factor, at) => renderer.zoom(factor, at),
    cancel() {
      if (placingId !== null || targetingId !== null) select(selectedIds);
      else select([]);
    },
  });

  function resize(): void {
    const { clientWidth, clientHeight } = elements.battlefield;
    renderer.resize(clientWidth, clientHeight, Math.min(window.devicePixelRatio, 2));
  }
  const observer = new ResizeObserver(resize);
  observer.observe(elements.battlefield);
  resize();

  function publishView(): void {
    const alive = new Set(loop.current.entities.map((entity) => entity.id));
    if (selectedIds.some((id) => !alive.has(id))) {
      selectedIds = selectedIds.filter((id) => alive.has(id));
    }
    const view = buildHudView({
      scenario,
      snapshot: loop.current,
      localPlayerId,
      selectedIds,
      placingId,
      targetingId,
      notice,
    });
    const serialized = JSON.stringify(view);
    if (serialized !== lastView) {
      lastView = serialized;
      onView(view);
    }
  }

  let lastTime = performance.now();
  let frameId = requestAnimationFrame(function frame(time) {
    const alpha = loop.advance((time - lastTime) / 1000);
    lastTime = time;
    publishView();
    renderer.draw(loop.previous, loop.current, alpha, { selectedIds, debug, ...guides });
    frameId = requestAnimationFrame(frame);
  });

  return {
    produce(definitionId) {
      const [building] = selected();
      if (building !== undefined)
        submit({ type: "produce", buildingId: building.id, definitionId });
    },
    buy(buildingId, slot, definitionId) {
      submit({ type: "produce", buildingId, definitionId, slot });
    },
    castOn(unitId, abilityId) {
      submit({ type: "cast", unitId, abilityId });
    },
    cast(abilityId) {
      const [caster] = selected();
      if (caster === undefined || !isOwn(caster)) return;
      const ability = definitionOf(caster).abilities.find(({ id }) => id === abilityId);
      if (ability === undefined) return;
      select(selectedIds);
      if (ability.target === "self") submit({ type: "cast", unitId: caster.id, abilityId });
      else targetingId = abilityId;
    },
    beginPlacement(definitionId) {
      placingId = definitionId;
      notice = null;
    },
    cancelPlacement() {
      select(selectedIds);
    },
    deselect() {
      select([]);
    },
    setDebug(value) {
      debug = value;
    },
    dispose() {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      detachInput();
      renderer.dispose();
    },
  };
}
