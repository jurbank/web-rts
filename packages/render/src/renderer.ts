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
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
  WebGLRenderer,
  type Object3D,
} from "three";
import { createCameraRig, type ScreenPoint } from "./camera.ts";

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
  body: Mesh;
  ring: Mesh;
  height: number;
  frame: number;
}

const GRID_SPACING = 4;
const UNIT_HEIGHT = 0.8;
const STRUCTURE_HEIGHT = 1.6;
const NEUTRAL_COLOR = "#8a8f98";
const BAR_WIDTH = 30;
const GUIDE_COLOR = "rgba(255, 255, 255, 0.55)";

export function createRenderer(
  canvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement,
  scenario: Scenario,
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

  const groundGeometry = new PlaneGeometry(map.width, map.height);
  const groundMaterial = new MeshLambertMaterial({ color: "#3b4a3f" });
  const groundMesh = new Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(map.width / 2, 0, map.height / 2);
  scene.add(groundMesh);

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
      };
      views.set(id, view);
      idsByBody.set(body, id);
    }
    return view;
  }

  function removeView(id: number, view: EntityView): void {
    scene.remove(view.body, view.ring);
    idsByBody.delete(view.body);
    views.delete(id);
  }

  function removeStaleViews(): void {
    for (const [id, view] of views) {
      if (view.frame !== frame) removeView(id, view);
    }
  }

  function drawOverlay({ debug, markers = [], routes = [], zones = [] }: Overlay): void {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.font = "12px ui-monospace, monospace";
    context.lineWidth = 2;
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
      for (const [id, view] of views) removeView(id, view);
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
          target: entity.target,
          waypoints: entity.waypoints,
          level: entity.level,
        });
      }
      removeStaleViews();
      gl.render(scene, rig.camera);
      drawOverlay(overlay);
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
      for (const material of [groundMaterial, gridMaterial, ringMaterial, ...materials.values()]) {
        material.dispose();
      }
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
