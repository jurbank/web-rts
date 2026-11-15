import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import type { Point } from "sim";

/** A position on the canvas in CSS pixels from its top-left corner. */
export interface ScreenPoint {
  x: number;
  y: number;
}

const FIELD_OF_VIEW = 40;
const PITCH = (55 * Math.PI) / 180;
const MIN_DISTANCE = 8;

/**
 * A perspective camera that looks down at a target on the ground. Sim x runs
 * right and sim y runs toward the viewer, so the ground plane is world XZ.
 */
export function createCameraRig(map: { width: number; height: number }) {
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 2000);
  const target = new Vector3(map.width / 2, 0, map.height / 2);
  const maxDistance = Math.max(map.width, map.height) * 1.5;
  let distance = maxDistance * 0.6;
  let width = 1;
  let height = 1;

  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const scratch = new Vector3();

  function update(): void {
    target.x = Math.min(map.width, Math.max(0, target.x));
    target.z = Math.min(map.height, Math.max(0, target.z));
    camera.position.set(
      target.x,
      distance * Math.sin(PITCH),
      target.z + distance * Math.cos(PITCH),
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function aim(screen: ScreenPoint): Raycaster {
    ndc.set((screen.x / width) * 2 - 1, 1 - (screen.y / height) * 2);
    raycaster.setFromCamera(ndc, camera);
    return raycaster;
  }

  function groundAt(screen: ScreenPoint): Point | null {
    const hit = aim(screen).ray.intersectPlane(ground, scratch);
    return hit === null ? null : { x: hit.x, y: hit.z };
  }

  function panGround(dx: number, dy: number): void {
    target.x += dx;
    target.z += dy;
    update();
  }

  update();

  return {
    camera,
    aim,
    groundAt,
    panGround,

    resize(newWidth: number, newHeight: number): void {
      width = newWidth;
      height = newHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      update();
    },

    project(point: Point): ScreenPoint {
      scratch.set(point.x, 0, point.y).project(camera);
      return { x: ((scratch.x + 1) / 2) * width, y: ((1 - scratch.y) / 2) * height };
    },

    /** Moves the camera so the ground under `from` ends up under `to`. */
    pan(from: ScreenPoint, to: ScreenPoint): void {
      const a = groundAt(from);
      const b = groundAt(to);
      if (a !== null && b !== null) panGround(a.x - b.x, a.y - b.y);
    },

    /** Scales the camera distance, keeping the ground under `at` in place. */
    zoom(factor: number, at: ScreenPoint): void {
      const before = groundAt(at);
      distance = Math.min(maxDistance, Math.max(MIN_DISTANCE, distance * factor));
      update();
      const after = groundAt(at);
      if (before !== null && after !== null) panGround(before.x - after.x, before.y - after.y);
    },
  };
}

export type CameraRig = ReturnType<typeof createCameraRig>;
