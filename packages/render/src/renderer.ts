import type { Definition, Scenario } from "data";
import type { FiredEvent, Point, SimEvent, Snapshot } from "sim";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { clipSeconds, sampleClip } from "./clips.ts";
import { createCrowd, type BakedPose } from "./crowd.ts";
import { createFogLayer } from "./fog.ts";
import { createCameraRig, type ScreenPoint } from "./camera.ts";
import { createModelLibrary, type BakedModel, type Model } from "./models.ts";
import { createEffects } from "./effects/effects.ts";
import { RECIPES, type Recipe, type RecipeName } from "./effects/recipes.ts";
import { GROUND_ORDER } from "./effects/blocks.ts";

/** A labelled spot on the ground, such as a start point. */
export interface Marker extends Readonly<Point> {
  readonly color: string;
  readonly label: string;
}

/** A labelled line on the ground through `points`, such as a path units walk. */
export interface Route {
  readonly points: readonly Readonly<Point>[];
  readonly label: string;
  /** Overrides the usual guide color. */
  readonly color?: string;
}

/** A labelled rectangle on the ground, from its low corner. */
export interface Zone extends Readonly<Point> {
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly color?: string;
}

/** What the app wants drawn on top of the snapshot. */
export interface Overlay {
  selectedIds: readonly number[];
  debug: boolean;
  markers?: readonly Marker[];
  routes?: readonly Route[];
  zones?: readonly Zone[];
}

export interface RendererOptions {
  /** The URL of the GLB that draws an entity, by its definition and owner. Entities without one draw as boxes. */
  models?: (definitionId: string, playerId: string | null) => string | undefined;
  /**
   * The style a player's effects take, such as their faction. A shot or death
   * plays the recipe named `<style>/<kind>` when `recipes` has it, and the
   * generic recipe of its kind otherwise.
   */
  effectStyle?: (playerId: string | null) => string | undefined;
  /** Recipes by name beyond the generic ones, such as `cyber-samurai/laser`. */
  recipes?: Readonly<Record<string, Recipe>>;
  /** Milliseconds now. A fixed clock steps clips and effects exactly, as an effect sheet does. */
  now?: () => number;
}

/** What the last frame cost to draw. */
export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  /** Live effect parts. */
  readonly particles: number;
}

export interface Renderer {
  /** Takes definitions and players that changed since creation, as the editor's do. */
  setContent(content: Pick<Scenario, "definitions" | "players">): void;
  resize(width: number, height: number, pixelRatio: number): void;
  /**
   * Starts what a tick's events call for, such as an attack or a death. Pass
   * each tick's events in order before the frame that draws them. A tick
   * passed again, as after a rewind, starts nothing twice. `elapsed` is how
   * many seconds ago the tick happened, when a frame catches up on several.
   */
  receive(tick: number, events: readonly SimEvent[], elapsed?: number): void;
  stats(): RenderStats;
  /** Whether a model it asked for is still loading. */
  loading(): boolean;
  /** Plays clips and effects slower, below 1, for review. Snapshots still decide where things are. */
  setTimeScale(scale: number): void;
  /** Draws the state `alpha` of the way from `previous` to `current`. */
  draw(previous: Snapshot, current: Snapshot, alpha: number, overlay: Overlay): void;
  /** The entity under a screen point, or the nearest one within `slop` pixels. */
  pickEntity(screen: ScreenPoint, slop: number): number | null;
  pickGround(screen: ScreenPoint): Point | null;
  entitiesInRect(a: ScreenPoint, b: ScreenPoint): number[];
  /** Centers the view on a ground point. */
  focus(point: Point): void;
  pan(from: ScreenPoint, to: ScreenPoint): void;
  zoom(factor: number, at: ScreenPoint): void;
  dispose(): void;
}

interface DrawnEntity extends Point {
  id: number;
  /** Health from 0 to 1, or null when it has none. */
  health: number | null;
  selected: boolean;
  target: Readonly<Point> | null;
  waypoints: readonly Readonly<Point>[];
  level: number;
}

interface EntityView {
  definitionId: string;
  playerId: string | null;
  /** The box drawn until a model loads. It stays as the target for picking. */
  body: Mesh;
  ring: Mesh;
  height: number;
  frame: number;
  color: Color;
  modelUrl: string | undefined;
  model: Model | undefined;
  rigid: Object3D | undefined;
  turret: Object3D | undefined;
  /** World-space bearing of the last visible shot. */
  shotBearing: number | undefined;
  scale: number;
  x: number;
  y: number;
  heading: number;
  facing: number;
  /** Seconds since it last moved. */
  still: number;
  /** It fired since its last frame, so its attack clip starts over. */
  fired: boolean;
  motion: Motion;
}

/** Which clip a baked model plays, and the one it is blending away from. */
interface Motion {
  clip: string;
  seconds: number;
  from: string | null;
  fromSeconds: number;
  blend: number;
}

interface Dying {
  id: number;
  model: BakedModel;
  x: number;
  y: number;
  heading: number;
  scale: number;
  color: Color;
  motion: Motion;
  age: number;
}

const GRID_SPACING = 4;
const UNIT_HEIGHT = 0.8;
const STRUCTURE_HEIGHT = 1.6;
/** The longest frame clips and effects advance by, the same cap the game loop steps with. */
const MAX_FRAME_SECONDS = 0.25;
/** A weapon this short strikes instead of shooting. */
const MELEE_RANGE = 1.5;

/** How tall an entity stands, for where its shots start and land. */
const heightOf = (definition: Definition | undefined) =>
  definition?.speed === undefined ? STRUCTURE_HEIGHT : UNIT_HEIGHT;

const NEUTRAL_COLOR = "#8a8f98";
const BAR_WIDTH = 30;
const GUIDE_COLOR = "rgba(255, 255, 255, 0.55)";
const BLEND_SECONDS = 0.15;
/** How long a unit stands still before it stops walking, so it does not flicker between ticks. */
const STOP_SECONDS = 0.1;
const TURN_RATE = 12;
/** A dead creature lies still this long after its clip, then sinks into the ground. */
const CORPSE_SECONDS = 1.5;
const SINK_SECONDS = 1.5;

export function createRenderer(
  canvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement,
  scenario: Scenario,
  options: RendererOptions = {},
): Renderer {
  const { map } = scenario;
  const gl = new WebGLRenderer({ canvas, antialias: true });
  const rig = createCameraRig(map);
  const scene = new Scene();
  scene.background = new Color("#11151a");
  scene.add(new HemisphereLight("#ffffff", "#40464f", 2));
  const sun = new DirectionalLight("#ffffff", 1.5);
  sun.position.set(-0.4, 1, 0.6);
  scene.add(sun);
  // Models are physically based, and glossy or metal faces need something to reflect.
  const pmrem = new PMREMGenerator(gl);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.5;

  const groundGeometry = new PlaneGeometry(map.width, map.height);
  const groundMaterial = new MeshLambertMaterial({ color: "#3b4a3f" });
  const groundMesh = new Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(map.width / 2, 0, map.height / 2);
  groundMesh.renderOrder = GROUND_ORDER;
  scene.add(groundMesh);
  const fogLayer = createFogLayer(groundGeometry, map.width, map.height);
  scene.add(fogLayer.mesh);

  const gridGeometry = new BufferGeometry();
  gridGeometry.setAttribute("position", new Float32BufferAttribute(gridLines(map), 3));
  const gridMaterial = new LineBasicMaterial({ color: "#56675b" });
  const grid = new LineSegments(gridGeometry, gridMaterial);
  grid.renderOrder = GROUND_ORDER;
  scene.add(grid);

  const boxGeometry = new BoxGeometry(1, 1, 1);
  const ringGeometry = new RingGeometry(1.25, 1.45, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new MeshBasicMaterial({ color: "#ffffff" });
  let definitions = new Map(scenario.definitions.map((definition) => [definition.id, definition]));
  let playerColors = new Map(scenario.players.map((player) => [player.id, player.color]));
  const materials = new Map<string, MeshLambertMaterial>();
  const library = createModelLibrary();
  const crowd = createCrowd(scene);
  const effects = createEffects(scene);
  /** Slows clips and effects, for reviewing them. */
  let timeScale = 1;
  /** The newest tick received, so a tick passed again starts nothing twice. */
  let receivedTick = -1;

  /** Loads every model the scenario can show now, so no device waits for one when it first comes into view. */
  function preload(content: Pick<Scenario, "definitions" | "players">): void {
    for (const definition of content.definitions) {
      for (const playerId of [null, ...content.players.map((player) => player.id)]) {
        const url = options.models?.(definition.id, playerId);
        if (url !== undefined) library.get(url);
      }
    }
  }
  preload(scenario);
  const teamMaterials = new Map<string, Material>();
  let dying: Dying[] = [];
  const now = options.now ?? (() => performance.now());
  let lastTime = now();
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const at = new Vector3();
  const size = new Vector3();

  function materialFor(color: string): MeshLambertMaterial {
    let material = materials.get(color);
    if (material === undefined) {
      material = new MeshLambertMaterial({ color });
      materials.set(color, material);
    }
    return material;
  }

  const views = new Map<number, EntityView>();
  const idsByBody = new Map<Object3D, number>();
  let drawn: DrawnEntity[] = [];
  let frame = 0;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  const context = overlayCanvas.getContext("2d")!;

  function viewFor(id: number, definitionId: string, playerId: string | null): EntityView {
    let view = views.get(id);
    // The editor rebuilds its world on every edit, so an id can come back as something else.
    if (view !== undefined && (view.definitionId !== definitionId || view.playerId !== playerId)) {
      removeView(id, view);
      view = undefined;
    }
    if (view === undefined) {
      const definition = definitions.get(definitionId);
      const radius = definition?.radius ?? 0.5;
      const color =
        definition?.color ??
        (playerId === null ? undefined : playerColors.get(playerId)) ??
        NEUTRAL_COLOR;
      const body = new Mesh(boxGeometry, materialFor(color));
      body.scale.set(radius * 2, 1, radius * 2);
      const ring = new Mesh(ringGeometry, ringMaterial);
      ring.scale.setScalar(radius);
      scene.add(body, ring);
      view = {
        definitionId,
        playerId,
        body,
        ring,
        height: definition?.speed === undefined ? STRUCTURE_HEIGHT : UNIT_HEIGHT,
        frame,
        color: new Color(color),
        modelUrl: options.models?.(definitionId, playerId),
        model: undefined,
        rigid: undefined,
        turret: undefined,
        shotBearing: undefined,
        scale: 1,
        x: Number.NaN,
        y: Number.NaN,
        heading: 0,
        facing: 0,
        still: Infinity,
        fired: false,
        motion: { clip: "idle", seconds: id * 0.37, from: null, fromSeconds: 0, blend: 1 },
      };
      views.set(id, view);
      idsByBody.set(body, id);
    }
    return view;
  }

  /** Swaps the box for the entity's model once it has loaded. */
  function attachModel(view: EntityView): void {
    if (view.model !== undefined || view.modelUrl === undefined) return;
    const model = library.get(view.modelUrl);
    if (model === undefined) return;
    const radius = definitions.get(view.definitionId)?.radius ?? 0.5;
    view.model = model;
    // A model built for a larger footprint than this definition's shrinks to fit it.
    view.scale = Math.min(1, radius / model.radius);
    view.body.visible = false;
    if (model.kind === "rigid") {
      view.rigid = model.scene.clone();
      view.turret = view.rigid.getObjectByName("turret");
      view.rigid.traverse((object) => {
        if (object instanceof Mesh && (object.material as Material).name === "team") {
          object.material = teamMaterial(object.material as Material, view.color);
        }
      });
      scene.add(view.rigid);
    }
  }

  function teamMaterial(source: Material, color: Color): Material {
    const key = `${source.uuid}:${color.getHexString()}`;
    let material = teamMaterials.get(key);
    if (material === undefined) {
      material = source.clone();
      (material as Material & { color: Color }).color.multiply(color);
      teamMaterials.set(key, material);
    }
    return material;
  }

  function turnToward(view: EntityView, dt: number): void {
    let turn = view.facing - view.heading;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    view.heading += turn * Math.min(1, dt * TURN_RATE);
  }

  /** Turns, picks a clip, and advances it, from how the unit moved since the last frame. */
  function animate(view: EntityView, model: BakedModel, x: number, y: number, dt: number): void {
    const moved = Number.isNaN(view.x) ? 0 : Math.hypot(x - view.x, y - view.y);
    if (moved > 1e-4) {
      view.facing = Math.atan2(x - view.x, y - view.y);
      view.still = 0;
    } else {
      view.still += dt;
    }
    turnToward(view, dt);

    const { clips, rate } = model;
    const motion = view.motion;
    if (view.fired && clips.attack !== undefined) play(motion, "attack", 0, true);
    view.fired = false;
    if (motion.clip === "attack" && motion.seconds < clipSeconds(clips.attack!, rate)) {
      motion.seconds += dt;
    } else if (view.still < STOP_SECONDS && clips.move !== undefined) {
      play(motion, "move");
      const stride = (clips.move.stride ?? 1) * view.scale;
      motion.seconds += (moved / stride) * clipSeconds(clips.move, rate);
    } else {
      play(motion, "idle");
      motion.seconds += dt;
    }
    motion.blend += dt;
  }

  function play(motion: Motion, clip: string, seconds = 0, restart = false): void {
    if (motion.clip === clip && !restart) return;
    motion.from = motion.clip;
    motion.fromSeconds = motion.seconds;
    motion.clip = clip;
    motion.seconds = seconds;
    motion.blend = 0;
  }

  function pose(model: BakedModel, motion: Motion): BakedPose {
    const clip = model.clips[motion.clip] ?? model.clips.idle;
    const [a, b, t] = sampleClip(clip, model.rate, motion.seconds);
    const from = motion.from === null ? undefined : model.clips[motion.from];
    const weight = from === undefined ? 1 : Math.min(1, motion.blend / BLEND_SECONDS);
    const leaving =
      from === undefined ? ([a, b, t] as const) : sampleClip(from, model.rate, motion.fromSeconds);
    return [[a, b, t, weight], leaving];
  }

  function drawBaked(
    model: BakedModel,
    x: number,
    y: number,
    lift: number,
    heading: number,
    scale: number,
    color: Color,
    motion: Motion,
  ): void {
    rotation.setFromAxisAngle(up, heading);
    matrix.compose(at.set(x, lift, y), rotation, size.setScalar(scale));
    crowd.add(model, matrix, color, pose(model, motion));
  }

  /**
   * A unit that fired plays its attack, turned toward its target or the way it
   * shot, and its shot plays from what the viewer sees of either end.
   */
  function startFiring(tick: number, elapsed: number, { from, to, direction }: FiredEvent): void {
    let dx = to === undefined || from === undefined ? (direction?.x ?? 0) : to.x - from.x;
    let dy = to === undefined || from === undefined ? (direction?.y ?? 0) : to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
    }
    const view = from === undefined ? undefined : views.get(from.id);
    if (view !== undefined) {
      view.fired = true;
      if (length > 0) view.shotBearing = Math.atan2(dx, dy);
    }
    const attacker = from === undefined ? undefined : definitions.get(from.definitionId);
    const targetView = to === undefined ? undefined : views.get(to.id);
    const target = targetView === undefined ? undefined : definitions.get(targetView.definitionId);
    const range = attacker?.weapon?.range ?? 6;
    const reach = (attacker?.radius ?? 0.5) * 0.9;
    const inset = (target?.radius ?? 0.4) * 0.5;
    const generic = range <= MELEE_RANGE ? "melee" : "bullet";
    // A hidden attacker's shot names no kind or style, so its impact says nothing of it.
    effects.play(
      from === undefined
        ? RECIPES[generic]
        : recipeFor(attacker?.weapon?.shot ?? generic, generic, from.playerId),
      {
        origin:
          from === undefined
            ? null
            : { x: from.x + dx * reach, y: heightOf(attacker) * 0.6, z: from.y + dy * reach },
        target:
          to === undefined
            ? null
            : { x: to.x - dx * inset, y: heightOf(target) * 0.5, z: to.y - dy * inset },
        direction: to === undefined && length > 0 ? { x: dx, y: 0, z: dy } : null,
        reach: range,
        scale: Math.min(2, Math.max(0.6, (attacker?.radius ?? 0.5) / 0.5)),
        seed: tick * 7919 + (from?.id ?? to?.id ?? 0),
      },
      elapsed,
    );
  }

  /** The owner's style of a kind, else the generic recipe of that kind, else the fallback's. */
  function recipeFor(kind: string, fallback: RecipeName, playerId: string | null): Recipe {
    const style = options.effectStyle?.(playerId);
    const styled = style === undefined ? undefined : options.recipes?.[`${style}/${kind}`];
    return styled ?? (kind in RECIPES ? RECIPES[kind as RecipeName] : RECIPES[fallback]);
  }

  /** Something that died bursts by its size, unless it is a resource running out. */
  function playDeath(
    tick: number,
    elapsed: number,
    event: Extract<SimEvent, { type: "died" }>,
  ): void {
    const definition = definitions.get(event.definitionId);
    if (definition?.resource !== undefined) return;
    const radius = definition?.radius ?? 0.5;
    const generic =
      definition?.speed === undefined
        ? "building-death"
        : radius >= 0.8
          ? "vehicle-death"
          : "unit-death";
    const recipe = recipeFor(generic, generic, event.playerId);
    effects.play(
      recipe,
      {
        origin: null,
        target: { x: event.x, y: 0, z: event.y },
        direction: null,
        reach: 0,
        scale: Math.min(3, Math.max(0.5, radius / (recipe.radius ?? 1))),
        seed: tick * 7919 + event.id,
      },
      elapsed,
    );
  }

  /** A creature that died keeps its view until its clip has played and it has sunk away. */
  function startDying(event: Extract<SimEvent, { type: "died" }>): void {
    const view = views.get(event.id);
    if (view?.model?.kind !== "baked" || view.model.clips.die === undefined) return;
    if (dying.some((corpse) => corpse.id === event.id)) return;
    const motion = { ...view.motion };
    play(motion, "die");
    dying.push({
      id: event.id,
      model: view.model,
      x: view.x,
      y: view.y,
      heading: view.heading,
      scale: view.scale,
      color: view.color,
      motion,
      age: 0,
    });
  }

  function drawDying(dt: number): void {
    dying = dying.filter((corpse) => {
      corpse.age += dt;
      corpse.motion.seconds += dt;
      corpse.motion.blend += dt;
      const sinking =
        corpse.age - clipSeconds(corpse.model.clips.die, corpse.model.rate) - CORPSE_SECONDS;
      if (sinking > SINK_SECONDS) return false;
      const lift = -Math.max(0, sinking / SINK_SECONDS) * corpse.scale * 1.2;
      drawBaked(
        corpse.model,
        corpse.x,
        corpse.y,
        lift,
        corpse.heading,
        corpse.scale,
        corpse.color,
        corpse.motion,
      );
      return true;
    });
  }

  function removeView(id: number, view: EntityView): void {
    if (view.rigid !== undefined) scene.remove(view.rigid);
    scene.remove(view.body, view.ring);
    idsByBody.delete(view.body);
    views.delete(id);
  }

  function removeStaleViews(): void {
    for (const [id, view] of views) {
      if (view.frame !== frame) removeView(id, view);
    }
  }

  function drawOverlay(
    { debug, markers = [], routes = [], zones = [] }: Overlay,
    fog: Snapshot["fog"],
  ): void {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.font = "12px ui-monospace, monospace";
    context.lineWidth = 2;
    // Dashed footprints are the last sighting of a building. They cannot be picked.
    context.setLineDash([4, 4]);
    context.strokeStyle = "rgba(210, 218, 225, 0.7)";
    for (const building of fog?.buildings ?? []) {
      const radius = definitions.get(building.definitionId)!.radius;
      context.beginPath();
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const corner = rig.project({ x: building.x + dx * radius, y: building.y + dy * radius });
        if (dx === -1 && dy === -1) context.moveTo(corner.x, corner.y);
        else context.lineTo(corner.x, corner.y);
      }
      context.closePath();
      context.stroke();
    }
    context.setLineDash([]);
    for (const zone of zones) {
      context.strokeStyle = context.fillStyle = zone.color ?? GUIDE_COLOR;
      const corners = [
        { x: zone.x, y: zone.y },
        { x: zone.x + zone.width, y: zone.y },
        { x: zone.x + zone.width, y: zone.y + zone.height },
        { x: zone.x, y: zone.y + zone.height },
      ].map((corner) => rig.project(corner));
      context.beginPath();
      corners.forEach((at, index) =>
        index === 0 ? context.moveTo(at.x, at.y) : context.lineTo(at.x, at.y),
      );
      context.closePath();
      context.stroke();
      context.fillText(zone.label, corners[3].x + 4, corners[3].y + 14);
    }
    context.setLineDash([8, 6]);
    for (const route of routes) {
      context.strokeStyle = context.fillStyle = route.color ?? GUIDE_COLOR;
      const points = route.points.map((point) => rig.project(point));
      context.beginPath();
      points.forEach((at, index) =>
        index === 0 ? context.moveTo(at.x, at.y) : context.lineTo(at.x, at.y),
      );
      context.stroke();
      if (points.length > 0) context.fillText(route.label, points[0].x + 6, points[0].y - 6);
    }
    context.setLineDash([]);
    for (const marker of markers) {
      const at = rig.project(marker);
      context.strokeStyle = marker.color;
      context.beginPath();
      context.arc(at.x, at.y, 9, 0, Math.PI * 2);
      context.moveTo(at.x - 14, at.y);
      context.lineTo(at.x + 14, at.y);
      context.moveTo(at.x, at.y - 14);
      context.lineTo(at.x, at.y + 14);
      context.stroke();
      context.fillStyle = "#ffffff";
      context.fillText(marker.label, at.x + 14, at.y + 18);
    }
    // Where selected units are headed, in the order they will get there.
    context.lineWidth = 1.5;
    context.setLineDash([4, 4]);
    context.strokeStyle = "rgba(255, 255, 255, 0.6)";
    context.fillStyle = "rgba(255, 255, 255, 0.8)";
    for (const entity of drawn) {
      if (!entity.selected || entity.waypoints.length === 0) continue;
      const at = rig.project(entity);
      context.beginPath();
      context.moveTo(at.x, at.y);
      for (const waypoint of entity.waypoints) {
        const to = rig.project(waypoint);
        context.lineTo(to.x, to.y);
      }
      context.stroke();
      for (const waypoint of entity.waypoints) {
        const to = rig.project(waypoint);
        context.fillRect(to.x - 2, to.y - 2, 4, 4);
      }
    }
    context.setLineDash([]);
    context.lineWidth = 1;
    context.strokeStyle = "#ffd60a";
    for (const entity of drawn) {
      const at = rig.project(entity);
      if (entity.health !== null && (entity.selected || entity.health < 1)) {
        const left = at.x - BAR_WIDTH / 2;
        const top = at.y - 26;
        context.fillStyle = "#11151a";
        context.fillRect(left - 1, top - 1, BAR_WIDTH + 2, 6);
        context.fillStyle =
          entity.health > 0.5 ? "#46a758" : entity.health > 0.25 ? "#ffc53d" : "#e5484d";
        context.fillRect(left, top, BAR_WIDTH * Math.max(0, entity.health), 4);
      }
      // A chevron for each level gained, so veterans stand out in a crowd.
      if (entity.level > 1) {
        context.strokeStyle = "#ffd60a";
        context.lineWidth = 2;
        const chevrons = Math.min(entity.level - 1, 3);
        for (let index = 0; index < chevrons; index++) {
          const y = at.y - 32 - index * 5;
          context.beginPath();
          context.moveTo(at.x - 5, y + 3);
          context.lineTo(at.x, y);
          context.lineTo(at.x + 5, y + 3);
          context.stroke();
        }
        context.lineWidth = 1;
      }
      if (!debug) continue;
      context.fillStyle = "#ffffff";
      context.fillText(
        `#${entity.id} ${entity.x.toFixed(1)}, ${entity.y.toFixed(1)}`,
        at.x + 10,
        at.y - 10,
      );
      if (entity.target !== null) {
        const to = rig.project(entity.target);
        context.beginPath();
        context.moveTo(at.x, at.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }
    }
  }

  return {
    setContent(content) {
      definitions = new Map(content.definitions.map((definition) => [definition.id, definition]));
      playerColors = new Map(content.players.map((player) => [player.id, player.color]));
      preload(content);
      for (const [id, view] of views) removeView(id, view);
      dying = [];
    },

    resize(newWidth, newHeight, newPixelRatio) {
      width = newWidth;
      height = newHeight;
      pixelRatio = newPixelRatio;
      gl.setPixelRatio(pixelRatio);
      gl.setSize(width, height, false);
      overlayCanvas.width = Math.round(width * pixelRatio);
      overlayCanvas.height = Math.round(height * pixelRatio);
      rig.resize(width, height);
    },

    receive(tick, events, elapsed = 0) {
      if (tick <= receivedTick) return;
      receivedTick = tick;
      for (const event of events) {
        if (event.type === "died") {
          startDying(event);
          playDeath(tick, elapsed, event);
        } else if (event.type === "fired") {
          startFiring(tick, elapsed, event);
        }
      }
    },

    setTimeScale(scale) {
      timeScale = scale;
    },

    loading: () => library.loading,

    stats() {
      return {
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        particles: effects.live,
      };
    },

    draw(previous, current, alpha, overlay) {
      frame += 1;
      drawn = [];
      const time = now();
      const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (time - lastTime) / 1000)) * timeScale;
      lastTime = time;
      crowd.begin();
      let p = 0;
      for (const entity of current.entities) {
        while (p < previous.entities.length && previous.entities[p].id < entity.id) p += 1;
        const from = previous.entities[p]?.id === entity.id ? previous.entities[p] : entity;
        const x = from.x + (entity.x - from.x) * alpha;
        const y = from.y + (entity.y - from.y) * alpha;
        const view = viewFor(entity.id, entity.definitionId, entity.playerId);
        const selected = overlay.selectedIds.includes(entity.id);
        const bodyHeight = view.height * Math.max(0.15, entity.built);
        view.frame = frame;
        view.body.scale.y = bodyHeight;
        view.body.position.set(x, bodyHeight / 2, y);
        view.ring.position.set(x, 0.02, y);
        attachModel(view);
        if (
          view.model !== undefined &&
          view.turret === undefined &&
          view.shotBearing !== undefined
        ) {
          view.facing = view.shotBearing;
          view.shotBearing = undefined;
        }
        if (view.model?.kind === "baked") {
          animate(view, view.model, x, y, dt);
          drawBaked(view.model, x, y, 0, view.heading, view.scale, view.color, view.motion);
        } else if (view.rigid !== undefined) {
          // Movement steers the hull. A turret aims independently, even on a fixed base.
          if (definitions.get(view.definitionId)?.speed !== undefined) {
            if (!Number.isNaN(view.x) && Math.hypot(x - view.x, y - view.y) > 1e-4) {
              view.facing = Math.atan2(x - view.x, y - view.y);
            }
            turnToward(view, dt);
          }
          view.rigid.position.set(x, 0, y);
          view.rigid.rotation.y = view.heading;
          if (view.turret !== undefined && view.shotBearing !== undefined) {
            view.turret.rotation.y = view.shotBearing - view.heading;
          }
          view.rigid.scale.set(view.scale, view.scale * Math.max(0.15, entity.built), view.scale);
        }
        view.x = x;
        view.y = y;
        view.ring.visible = selected;
        drawn.push({
          id: entity.id,
          x,
          y,
          health:
            entity.health === null || entity.maxHealth === null
              ? null
              : entity.health / entity.maxHealth,
          selected,
          target: entity.target ?? null,
          waypoints: entity.waypoints ?? [],
          level: entity.level,
        });
      }
      removeStaleViews();
      drawDying(dt);
      crowd.end();
      fogLayer.update(current.fog);
      effects.update(dt);
      gl.render(scene, rig.camera);
      drawOverlay(overlay, current.fog);
    },

    pickEntity(screen, slop) {
      const bodies = [...views.values()].map((view) => view.body);
      const hit = rig.aim(screen).intersectObjects(bodies, false)[0];
      if (hit !== undefined) return idsByBody.get(hit.object) ?? null;
      let best: number | null = null;
      let bestDistance = slop;
      for (const entity of drawn) {
        const at = rig.project(entity);
        const distance = Math.hypot(at.x - screen.x, at.y - screen.y);
        if (distance <= bestDistance) {
          best = entity.id;
          bestDistance = distance;
        }
      }
      return best;
    },

    pickGround: (screen) => rig.groundAt(screen),

    entitiesInRect(a, b) {
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      return drawn
        .filter((entity) => {
          const at = rig.project(entity);
          return at.x >= left && at.x <= right && at.y >= top && at.y <= bottom;
        })
        .map((entity) => entity.id);
    },

    focus: (point) => rig.focus(point),
    pan: (from, to) => rig.pan(from, to),
    zoom: (factor, at) => rig.zoom(factor, at),

    dispose() {
      for (const geometry of [groundGeometry, gridGeometry, boxGeometry, ringGeometry]) {
        geometry.dispose();
      }
      const owned = [groundMaterial, gridMaterial, ringMaterial, ...materials.values()];
      for (const material of [...owned, ...teamMaterials.values()]) material.dispose();
      crowd.dispose();
      effects.dispose();
      library.dispose();
      environment.dispose();
      pmrem.dispose();
      fogLayer.dispose();
      gl.dispose();
    },
  };
}

function gridLines(map: { width: number; height: number }): number[] {
  const lift = 0.01;
  const positions: number[] = [];
  for (let x = 0; x <= map.width; x += GRID_SPACING) {
    positions.push(x, lift, 0, x, lift, map.height);
  }
  for (let y = 0; y <= map.height; y += GRID_SPACING) {
    positions.push(0, lift, y, map.width, lift, y);
  }
  return positions;
}
