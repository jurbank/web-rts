import type { Scenario } from "data";
import type { Point, Snapshot } from "sim";
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
}

export interface Renderer {
  /** Takes definitions and players that changed since creation, as the editor's do. */
  setContent(content: Pick<Scenario, "definitions" | "players">): void;
  resize(width: number, height: number, pixelRatio: number): void;
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
  scale: number;
  x: number;
  y: number;
  heading: number;
  facing: number;
  /** Seconds since it last moved. */
  still: number;
  /** Seconds until an attacking unit swings again. */
  swing: number;
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
  scene.add(groundMesh);
  const fogLayer = createFogLayer(groundGeometry, map.width, map.height);
  scene.add(fogLayer.mesh);

  const gridGeometry = new BufferGeometry();
  gridGeometry.setAttribute("position", new Float32BufferAttribute(gridLines(map), 3));
  const gridMaterial = new LineBasicMaterial({ color: "#56675b" });
  scene.add(new LineSegments(gridGeometry, gridMaterial));

  const boxGeometry = new BoxGeometry(1, 1, 1);
  const ringGeometry = new RingGeometry(1.25, 1.45, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new MeshBasicMaterial({ color: "#ffffff" });
  let definitions = new Map(scenario.definitions.map((definition) => [definition.id, definition]));
  let playerColors = new Map(scenario.players.map((player) => [player.id, player.color]));
  const materials = new Map<string, MeshLambertMaterial>();
  const library = createModelLibrary();
  const crowd = createCrowd(scene);

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
  let eventsTick = -1;
  let lastTime = performance.now();
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
        scale: 1,
        x: Number.NaN,
        y: Number.NaN,
        heading: 0,
        facing: 0,
        still: Infinity,
        swing: 0,
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

  /** Turns, picks a clip, and advances it, from how the unit moved since the last frame. */
  function animate(
    view: EntityView,
    model: BakedModel,
    entity: Snapshot["entities"][number],
    x: number,
    y: number,
    dt: number,
  ): void {
    const moved = Number.isNaN(view.x) ? 0 : Math.hypot(x - view.x, y - view.y);
    if (moved > 1e-4) {
      view.facing = Math.atan2(x - view.x, y - view.y);
      view.still = 0;
    } else {
      view.still += dt;
    }
    let turn = view.facing - view.heading;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    view.heading += turn * Math.min(1, dt * TURN_RATE);

    const { clips, rate } = model;
    const motion = view.motion;
    if (view.still < STOP_SECONDS && clips.move !== undefined) {
      play(motion, "move");
      const stride = (clips.move.stride ?? 1) * view.scale;
      motion.seconds += (moved / stride) * clipSeconds(clips.move, rate);
    } else if (entity.order === "attack" && clips.attack !== undefined) {
      // Until sim announces each shot, a unit swings once per weapon cooldown while it attacks.
      view.swing -= dt;
      if (view.swing <= 0) {
        view.swing = definitions.get(view.definitionId)?.weapon?.cooldown ?? 1;
        play(motion, "attack", 0, true);
      } else if (motion.clip === "attack" && motion.seconds >= clipSeconds(clips.attack, rate)) {
        play(motion, "idle");
      }
      motion.seconds += dt;
    } else {
      view.swing = 0;
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

  /** A creature that died keeps its view until its clip has played and it has sunk away. */
  function startDying(events: Snapshot["events"]): void {
    for (const event of events) {
      if (event.type !== "died") continue;
      const view = views.get(event.id);
      if (view?.model?.kind !== "baked" || view.model.clips.die === undefined) continue;
      const motion = { ...view.motion };
      play(motion, "die");
      dying.push({
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

    draw(previous, current, alpha, overlay) {
      frame += 1;
      drawn = [];
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      crowd.begin();
      if (current.tick !== eventsTick) {
        eventsTick = current.tick;
        startDying(current.events);
      }
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
        if (view.model?.kind === "baked") {
          animate(view, view.model, entity, x, y, dt);
          drawBaked(view.model, x, y, 0, view.heading, view.scale, view.color, view.motion);
        } else if (view.rigid !== undefined) {
          if (!Number.isNaN(view.x) && Math.hypot(x - view.x, y - view.y) > 1e-4) {
            view.heading = Math.atan2(x - view.x, y - view.y);
          }
          view.rigid.position.set(x, 0, y);
          view.rigid.rotation.y = view.heading;
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
