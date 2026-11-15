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

/** What the app wants drawn on top of the snapshot. */
export interface Overlay {
  selectedIds: readonly number[];
  debug: boolean;
}

export interface Renderer {
  resize(width: number, height: number, pixelRatio: number): void;
  /** Draws the state `alpha` of the way from `previous` to `current`. */
  draw(previous: Snapshot, current: Snapshot, alpha: number, overlay: Overlay): void;
  /** The unit under a screen point, or the nearest one within `slop` pixels. */
  pickUnit(screen: ScreenPoint, slop: number): number | null;
  pickGround(screen: ScreenPoint): Point | null;
  unitsInRect(a: ScreenPoint, b: ScreenPoint): number[];
  pan(from: ScreenPoint, to: ScreenPoint): void;
  zoom(factor: number, at: ScreenPoint): void;
  dispose(): void;
}

interface DrawnUnit extends Point {
  id: number;
  target: Readonly<Point> | null;
}

interface UnitView {
  body: Mesh;
  ring: Mesh;
  frame: number;
}

const GRID_SPACING = 4;
const BODY_HEIGHT = 0.8;

export function createRenderer(
  canvas: HTMLCanvasElement,
  debugCanvas: HTMLCanvasElement,
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
  const playerMaterials = new Map(
    scenario.players.map((player) => [player.id, new MeshLambertMaterial({ color: player.color })]),
  );
  const radii = new Map(
    scenario.unitDefinitions.map((definition) => [definition.id, definition.radius]),
  );

  const views = new Map<number, UnitView>();
  const idsByBody = new Map<Object3D, number>();
  let drawn: DrawnUnit[] = [];
  let frame = 0;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  const debug = debugCanvas.getContext("2d")!;

  function viewFor(id: number, definitionId: string, playerId: string): UnitView {
    let view = views.get(id);
    if (view === undefined) {
      const radius = radii.get(definitionId) ?? 0.5;
      const body = new Mesh(boxGeometry, playerMaterials.get(playerId));
      body.scale.set(radius * 2, BODY_HEIGHT, radius * 2);
      const ring = new Mesh(ringGeometry, ringMaterial);
      ring.scale.setScalar(radius);
      scene.add(body, ring);
      view = { body, ring, frame };
      views.set(id, view);
      idsByBody.set(body, id);
    }
    return view;
  }

  function removeStaleViews(): void {
    for (const [id, view] of views) {
      if (view.frame === frame) continue;
      scene.remove(view.body, view.ring);
      idsByBody.delete(view.body);
      views.delete(id);
    }
  }

  function drawDebug(): void {
    debug.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    debug.font = "12px ui-monospace, monospace";
    debug.fillStyle = "#ffffff";
    debug.strokeStyle = "#ffd60a";
    for (const unit of drawn) {
      const at = rig.project(unit);
      debug.fillText(
        `#${unit.id} ${unit.x.toFixed(1)}, ${unit.y.toFixed(1)}`,
        at.x + 10,
        at.y - 10,
      );
      if (unit.target !== null) {
        const to = rig.project(unit.target);
        debug.beginPath();
        debug.moveTo(at.x, at.y);
        debug.lineTo(to.x, to.y);
        debug.stroke();
      }
    }
  }

  return {
    resize(newWidth, newHeight, newPixelRatio) {
      width = newWidth;
      height = newHeight;
      pixelRatio = newPixelRatio;
      gl.setPixelRatio(pixelRatio);
      gl.setSize(width, height, false);
      debugCanvas.width = Math.round(width * pixelRatio);
      debugCanvas.height = Math.round(height * pixelRatio);
      rig.resize(width, height);
    },

    draw(previous, current, alpha, overlay) {
      frame += 1;
      drawn = [];
      let p = 0;
      for (const unit of current.units) {
        while (p < previous.units.length && previous.units[p].id < unit.id) p += 1;
        const from = previous.units[p]?.id === unit.id ? previous.units[p] : unit;
        const x = from.x + (unit.x - from.x) * alpha;
        const y = from.y + (unit.y - from.y) * alpha;
        const view = viewFor(unit.id, unit.definitionId, unit.playerId);
        view.frame = frame;
        view.body.position.set(x, BODY_HEIGHT / 2, y);
        view.ring.position.set(x, 0.02, y);
        view.ring.visible = overlay.selectedIds.includes(unit.id);
        drawn.push({ id: unit.id, x, y, target: unit.target });
      }
      removeStaleViews();
      gl.render(scene, rig.camera);

      debug.setTransform(1, 0, 0, 1, 0, 0);
      debug.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
      if (overlay.debug) drawDebug();
    },

    pickUnit(screen, slop) {
      const bodies = [...views.values()].map((view) => view.body);
      const hit = rig.aim(screen).intersectObjects(bodies, false)[0];
      if (hit !== undefined) return idsByBody.get(hit.object) ?? null;
      let best: number | null = null;
      let bestDistance = slop;
      for (const unit of drawn) {
        const at = rig.project(unit);
        const distance = Math.hypot(at.x - screen.x, at.y - screen.y);
        if (distance <= bestDistance) {
          best = unit.id;
          bestDistance = distance;
        }
      }
      return best;
    },

    pickGround: rig.groundAt,

    unitsInRect(a, b) {
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      return drawn
        .filter((unit) => {
          const at = rig.project(unit);
          return at.x >= left && at.x <= right && at.y >= top && at.y <= bottom;
        })
        .map((unit) => unit.id);
    },

    pan: (from, to) => rig.pan(from, to),
    zoom: (factor, at) => rig.zoom(factor, at),

    dispose() {
      for (const geometry of [groundGeometry, gridGeometry, boxGeometry, ringGeometry]) {
        geometry.dispose();
      }
      for (const material of [
        groundMaterial,
        gridMaterial,
        ringMaterial,
        ...playerMaterials.values(),
      ]) {
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
