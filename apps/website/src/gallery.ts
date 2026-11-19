import { FORMAT_VERSION, loadScenario } from "data";
import { createRenderer, type RenderStats } from "render";
import { createWorld, takeSnapshot, type Snapshot } from "sim";
import { FACTION_RECIPES } from "./factionEffects.ts";
import { FACTIONS } from "./factions.ts";
import type { GameElements } from "./game.ts";

/** What fires or dies in the gallery. */
export const SUBJECTS = ["soldier", "tank", "war-factory"] as const;
export type Subject = (typeof SUBJECTS)[number];

export interface GallerySettings {
  readonly faction: string;
  /** A shot plays the kind in `effect`. A death plays the kind its subject's size calls for. */
  readonly kind: "shot" | "death";
  readonly effect: string;
  readonly subject: Subject;
  /** Below 1 plays effects in slow motion. */
  readonly speed: number;
}

const SUBJECT_RADIUS: Record<Subject, number> = { soldier: 0.4, tank: 1, "war-factory": 2.5 };

const SHOOTER = { x: 13, y: 12 };
const TARGET = { x: 20, y: 12 };
const SHOT_SECONDS = 0.8;
const DEATH_SECONDS = 3.5;
/** A dead target stays gone this long before it stands again. */
const GONE_SECONDS = 3;

/** Every subject's weapon fires the kind of shot on show, as a scenario's would. */
const scenarioFor = (settings: GallerySettings) =>
  loadScenario({
    formatVersion: FORMAT_VERSION,
    map: { width: 40, height: 24 },
    players: [
      { id: "red", team: "west", controller: "none", color: "#d94848", resources: 0 },
      { id: "blue", team: "east", controller: "none", color: "#4878d9", resources: 0 },
    ],
    definitions: [
      {
        id: "soldier",
        name: "Soldier",
        look: "soldier",
        radius: SUBJECT_RADIUS.soldier,
        speed: 2,
        maxHealth: 50,
        weapon: { damage: 1, range: 6, cooldown: 1, ...shot(settings) },
      },
      {
        id: "tank",
        name: "Tank",
        look: "tank",
        radius: SUBJECT_RADIUS.tank,
        speed: 2,
        maxHealth: 200,
        weapon: { damage: 1, range: 7, cooldown: 1, ...shot(settings) },
      },
      {
        id: "war-factory",
        name: "War factory",
        look: "war-factory",
        radius: SUBJECT_RADIUS["war-factory"],
        maxHealth: 800,
        weapon: { damage: 1, range: 8, cooldown: 1, ...shot(settings) },
      },
    ],
    placements: SUBJECTS.flatMap((definitionId) => [
      { definitionId, playerId: "red", ...SHOOTER },
      { definitionId, playerId: "blue", ...TARGET },
    ]),
  });

const shot = (settings: GallerySettings) =>
  settings.kind === "shot" ? { shot: settings.effect } : {};

/** A still battlefield with one shooter and one target, drawn by a match's renderer. */
function createStage(
  canvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  settings: GallerySettings,
  now?: () => number,
) {
  const faction = FACTIONS.find((candidate) => candidate.id === settings.faction);
  const scenario = scenarioFor(settings);
  const renderer = createRenderer(canvas, overlay, scenario, {
    models: (definitionId) => {
      const path = faction?.models[definitionId];
      return path === undefined ? undefined : `${import.meta.env.BASE_URL}models/${path}.glb`;
    },
    effectStyle: () => settings.faction,
    recipes: FACTION_RECIPES,
    now,
  });
  renderer.focus({ x: (SHOOTER.x + TARGET.x) / 2, y: SHOOTER.y });

  const full = takeSnapshot(createWorld(scenario, 1));
  const find = (playerId: string) =>
    full.entities.find(
      (entity) => entity.playerId === playerId && entity.definitionId === settings.subject,
    )!;
  const shooter = find("red");
  const target = find("blue");
  let tick = 0;

  return {
    renderer,

    /** Fires or kills once, as a match's events would. */
    play(): void {
      tick += 1;
      renderer.receive(tick, [
        settings.kind === "shot"
          ? {
              type: "fired",
              from: {
                id: shooter.id,
                definitionId: shooter.definitionId,
                playerId: "red",
                x: shooter.x,
                y: shooter.y,
              },
              to: { id: target.id, playerId: "blue", x: target.x, y: target.y },
            }
          : {
              type: "died",
              id: target.id,
              definitionId: target.definitionId,
              playerId: "blue",
              x: target.x,
              y: target.y,
            },
      ]);
    },

    draw(targetGone: boolean): void {
      const snapshot: Snapshot = {
        ...full,
        tick,
        entities: full.entities.filter(
          (entity) => entity.id === shooter.id || (entity.id === target.id && !targetGone),
        ),
      };
      renderer.draw(snapshot, snapshot, 0, { selectedIds: [], debug: false });
    },
  };
}

/**
 * Plays one effect on loop over a still battlefield, through the same events
 * and renderer as a match, so what the gallery shows is what a match draws.
 */
export function mountGallery(
  elements: GameElements,
  settings: GallerySettings,
  onStats: (stats: RenderStats) => void,
): { zoom(factor: number): void; dispose(): void } {
  const stage = createStage(elements.scene, elements.overlay, settings);
  const { renderer } = stage;
  renderer.setTimeScale(settings.speed);

  function resize(): void {
    const { clientWidth, clientHeight } = elements.battlefield;
    renderer.resize(clientWidth, clientHeight, Math.min(window.devicePixelRatio, 2));
  }
  const observer = new ResizeObserver(resize);
  observer.observe(elements.battlefield);
  resize();

  let clock = 0;
  let next = 0.3;
  let goneUntil = -1;
  let last = performance.now();
  let frameId = requestAnimationFrame(function frame(time) {
    clock += Math.min(0.1, (time - last) / 1000) * settings.speed;
    last = time;
    if (clock >= next) {
      next = clock + (settings.kind === "shot" ? SHOT_SECONDS : DEATH_SECONDS);
      stage.play();
      if (settings.kind === "death") goneUntil = clock + GONE_SECONDS;
    }
    stage.draw(clock < goneUntil);
    frameId = requestAnimationFrame(frame);
  });
  const stats = setInterval(() => onStats(renderer.stats()), 500);

  return {
    zoom(factor) {
      const { clientWidth, clientHeight } = elements.battlefield;
      renderer.zoom(factor, { x: clientWidth / 2, y: clientHeight / 2 });
    },
    dispose() {
      cancelAnimationFrame(frameId);
      clearInterval(stats);
      observer.disconnect();
      renderer.dispose();
    },
  };
}

/** Seconds after the event that a sheet shows, in columns. */
const SHEET_TIMES = { shot: [0.02, 0.06, 0.12, 0.25], death: [0.05, 0.3, 0.8, 2] } as const;
const DESKTOP = { width: 360, height: 240 };
const PHONE = { width: 180, height: 120 };
const SHEET_STEP = 1 / 60;
const HEADER = 28;
const LABEL = 18;
const GAP = 8;

export interface EffectSheet {
  /** The sheet as a PNG data URL. */
  readonly png: string;
  readonly peakParticles: number;
  readonly peakDrawCalls: number;
  readonly peakTriangles: number;
}

/**
 * Renders an effect at fixed moments after its event, at a desktop's and a
 * phone's pixel size, on one image. It steps a fixed clock, so the same
 * settings draw the same sheet every time. Effect reviews read these.
 */
export async function renderEffectSheet(settings: GallerySettings): Promise<EffectSheet> {
  let now = 0;
  const canvas = document.createElement("canvas");
  const stage = createStage(canvas, document.createElement("canvas"), settings, () => now);
  const { renderer } = stage;
  renderer.resize(DESKTOP.width, DESKTOP.height, 1);
  // A death fills the frame around what died. A shot keeps both ends in view.
  if (settings.kind === "death") renderer.focus(TARGET);
  const radius = SUBJECT_RADIUS[settings.subject];
  const zoom = settings.kind === "death" ? 0.2 + radius * 0.1 : 0.35;
  renderer.zoom(zoom, { x: DESKTOP.width / 2, y: DESKTOP.height / 2 });
  do {
    stage.draw(false);
    await new Promise(requestAnimationFrame);
  } while (renderer.loading());
  stage.draw(false);

  const times = SHEET_TIMES[settings.kind];
  const sheet = document.createElement("canvas");
  sheet.width = GAP + times.length * (DESKTOP.width + GAP);
  sheet.height = HEADER + LABEL + DESKTOP.height + GAP + PHONE.height + LABEL + GAP;
  const context = sheet.getContext("2d")!;
  context.fillStyle = "#0b0e12";
  context.fillRect(0, 0, sheet.width, sheet.height);
  context.fillStyle = "#e6e9ee";
  context.font = "14px ui-monospace, monospace";

  let peakParticles = 0;
  let peakDrawCalls = 0;
  let peakTriangles = 0;
  const gone = settings.kind === "death";
  stage.play();
  let elapsed = 0;
  for (const [column, time] of times.entries()) {
    while (elapsed + SHEET_STEP <= time + 1e-9) {
      now += SHEET_STEP * 1000;
      elapsed += SHEET_STEP;
      stage.draw(gone);
      const stats = renderer.stats();
      peakParticles = Math.max(peakParticles, stats.particles);
      peakDrawCalls = Math.max(peakDrawCalls, stats.drawCalls);
      peakTriangles = Math.max(peakTriangles, stats.triangles);
    }
    const x = GAP + column * (DESKTOP.width + GAP);
    context.fillText(`${time.toFixed(2)} s`, x, HEADER + LABEL - 5);
    stage.draw(gone);
    context.drawImage(canvas, x, HEADER + LABEL);
    renderer.resize(PHONE.width, PHONE.height, 1);
    stage.draw(gone);
    context.drawImage(canvas, x, HEADER + LABEL + DESKTOP.height + GAP);
    renderer.resize(DESKTOP.width, DESKTOP.height, 1);
  }
  context.fillText(
    `${settings.faction} · ${settings.kind === "shot" ? settings.effect : "death"} · ${settings.subject}    peak ${peakParticles} parts · ${peakDrawCalls} draws · ${peakTriangles} tris`,
    GAP,
    19,
  );
  context.fillText("top: desktop pixels    bottom: phone pixels", GAP, sheet.height - GAP - 2);
  renderer.dispose();
  return { png: sheet.toDataURL("image/png"), peakParticles, peakDrawCalls, peakTriangles };
}
