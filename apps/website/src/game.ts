import type { Scenario } from "data";
import { createRenderer, type ScreenPoint } from "render";
import { createWorld, type Command, type EntitySnapshot } from "sim";
import { scenarioGuides } from "./guides.ts";
import { buildHudView, type HudView, type OrderMode } from "./hud.ts";
import { attachInput, showBox, type Shortcut } from "./input.ts";
import { createGameLoop } from "./loop.ts";
import type { Seating } from "./seating.ts";

export interface GameElements {
  battlefield: HTMLElement;
  scene: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  box: HTMLElement;
}

/** What the HUD can ask of a running game. */
export interface Game {
  produce(definitionId: string): void;
  /** Researches the next level of an upgrade in the one selected building. */
  research(upgradeId: string): void;
  /** Buys the offer in a shop's slot, whatever is selected. */
  buy(buildingId: number, slot: number, definitionId: string): void;
  /** Uses an ability of an entity that needs no target, whatever is selected. */
  castOn(unitId: number, abilityId: string): void;
  /** Uses an ability of the selected unit. One that needs an enemy waits for the next tap. */
  cast(abilityId: string): void;
  /** The next tap on the ground places this building. */
  beginPlacement(definitionId: string): void;
  cancelPlacement(): void;
  /** Attack and patrol wait for a tap. The rest act on the selection now. */
  shortcut(shortcut: Shortcut): void;
  /** While on, new orders go after the ones units already have. */
  setQueueing(on: boolean): void;
  /** While on, the HUD offers every group number to put the selection in. */
  setGroupMode(on: boolean): void;
  deselect(): void;
  /** Leaves the match. The local player is defeated and their team plays on. */
  concede(): void;
  setDebug(debug: boolean): void;
  dispose(): void;
}

type CommandFields<T> = T extends Command ? Omit<T, "playerId" | "tick"> : never;

export function createGame(
  scenario: Scenario,
  elements: GameElements,
  onView: (view: HudView) => void,
  { localPlayerId, seats, seed }: Seating & { seed: number },
): Game {
  const localPlayer = scenario.players.find((player) => player.id === localPlayerId)!;
  const definitions = new Map(
    scenario.definitions.map((definition) => [definition.id, definition]),
  );
  const loop = createGameLoop(createWorld(scenario, seed, seats), localPlayerId);
  const renderer = createRenderer(elements.scene, elements.overlay, scenario);
  const guides = scenarioGuides(scenario);

  const home =
    localPlayer.start ?? loop.current.entities.find((entity) => entity.playerId === localPlayerId);
  if (home !== undefined) renderer.focus(home);

  let selectedIds: number[] = [];
  let placingId: string | null = null;
  let targetingId: string | null = null;
  let mode: OrderMode | null = null;
  /** The HUD's queue toggle, and the key that queues while held (Shift). */
  let queueToggle = false;
  let queueHeld = false;
  let settingGroup = false;
  /** Control groups by number, 1 to 9. App state, not world state (U4). */
  const groups = new Map<number, number[]>();
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

  function submit(fields: CommandFields<Command>): void {
    loop.submit({ ...fields, playerId: localPlayerId, tick: loop.tick } as Command);
    notice = null;
  }

  const queueing = () => queueToggle || queueHeld;

  /** Submits an order for units, after their current ones while queueing. */
  function order(fields: CommandFields<Extract<Command, { queued?: boolean }>>): void {
    submit(queueing() ? { ...fields, queued: true } : fields);
  }

  function select(ids: number[]): void {
    selectedIds = ids;
    placingId = null;
    targetingId = null;
    mode = null;
    settingGroup = false;
    notice = null;
  }

  /** The selected units the local player owns that can move. */
  const movers = () =>
    selected().filter((unit) => isOwn(unit) && definitionOf(unit).speed !== undefined);

  function beginMode(next: OrderMode): void {
    if (movers().length === 0) return;
    placingId = null;
    targetingId = null;
    mode = next;
    notice = null;
  }

  function assignGroup(number: number): void {
    const ids = selected()
      .filter(isOwn)
      .map((entity) => entity.id);
    if (ids.length > 0) groups.set(number, ids);
  }

  function selectGroup(number: number): void {
    const alive = new Set(loop.current.entities.map((entity) => entity.id));
    select((groups.get(number) ?? []).filter((id) => alive.has(id)));
  }

  function place(at: ScreenPoint): void {
    const definition = definitions.get(placingId!)!;
    const ground = renderer.pickGround(at);
    if (ground === null || !loop.canPlace(definition, ground.x, ground.y)) {
      notice = scenario.fogOfWar
        ? `${definition.name} needs a clear, fully visible site`
        : `${definition.name} does not fit there`;
      return;
    }
    order({ type: "build", unitIds: selectedIds, definitionId: definition.id, ...ground });
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
      order({ type: "cast", unitId: selectedIds[0], abilityId: targetingId, targetId: entity.id });
      targetingId = null;
      return;
    }
    const units = movers();
    const unitIds = units.map((unit) => unit.id);

    if (mode !== null) {
      const ground = renderer.pickGround(at);
      if (mode === "attack" && entity !== undefined && isHostile(entity)) {
        order({ type: "attack", unitIds, targetId: entity.id });
      } else if (mode === "attack" && loop.current.refusedCommands.includes("move")) {
        // `sim` refuses an attack-move while moving is refused.
        notice = "Units cannot move now. Tap an enemy";
        return;
      } else if (ground !== null) {
        order({ type: mode, unitIds, ...ground });
      }
      // While queueing the mode stays, so several points take one tap each.
      if (!queueing()) mode = null;
      return;
    }

    if (entity !== undefined && isOwn(entity)) {
      const canAssist =
        entity.built < 1 &&
        units.some((unit) => definitionOf(unit).builds.includes(entity.definitionId));
      if (canAssist) {
        order({ type: "assist", unitIds, buildingId: entity.id });
        return;
      }
      if (maySelect && !selectedIds.includes(entity.id)) {
        select([entity.id]);
        return;
      }
    }
    if (unitIds.length === 0) return;
    if (entity !== undefined && isHostile(entity)) {
      order({ type: "attack", unitIds, targetId: entity.id });
    } else if (entity !== undefined && definitionOf(entity).resource !== undefined) {
      order({ type: "gather", unitIds, nodeId: entity.id });
    } else {
      const ground = renderer.pickGround(at);
      if (ground !== null) order({ type: "move", unitIds, ...ground });
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
      if (placingId !== null || targetingId !== null || mode !== null) select(selectedIds);
      else select([]);
    },
    queueHeld(held) {
      queueHeld = held;
    },
    shortcut: run,
  });

  function run(shortcut: Shortcut): void {
    switch (shortcut.kind) {
      case "attack":
      case "patrol":
        beginMode(shortcut.kind);
        return;
      case "hold":
        hold();
        return;
      case "stop":
        stop();
        return;
      case "selectGroup":
        selectGroup(shortcut.number);
        return;
      case "setGroup":
        assignGroup(shortcut.number);
        settingGroup = false;
        return;
    }
  }

  function hold(): void {
    const unitIds = movers().map((unit) => unit.id);
    if (unitIds.length > 0) order({ type: "hold", unitIds });
  }

  function stop(): void {
    const unitIds = movers().map((unit) => unit.id);
    if (unitIds.length > 0) submit({ type: "stop", unitIds });
    mode = null;
  }

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
      mode,
      queueing: queueing(),
      settingGroup,
      groups: [...groups].sort(([a], [b]) => a - b).map(([number, ids]) => ({ number, ids })),
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
    concede() {
      submit({ type: "concede" });
    },
    produce(definitionId) {
      const [building] = selected();
      if (building !== undefined)
        submit({ type: "produce", buildingId: building.id, definitionId });
    },
    research(upgradeId) {
      const [building] = selected();
      if (building !== undefined) submit({ type: "research", buildingId: building.id, upgradeId });
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
    shortcut: run,
    setQueueing(on) {
      queueToggle = on;
    },
    setGroupMode(on) {
      settingGroup = on;
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
