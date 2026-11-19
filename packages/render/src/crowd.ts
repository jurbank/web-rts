import { Color, InstancedBufferAttribute, InstancedMesh, type Matrix4, type Scene } from "three";
import type { BakedModel, BakedPart } from "./models.ts";

interface Batch {
  mesh: InstancedMesh;
  playing: InstancedBufferAttribute;
  leaving: InstancedBufferAttribute;
  count: number;
}

/** Rows and steps for a baked instance: [row, next row, step, weight] for the playing clip and the one it leaves. */
export type BakedPose = readonly [
  playing: readonly [number, number, number, number],
  leaving: readonly [number, number, number],
];

/** Draws every creature of a model part as one instanced mesh, refilled each frame. */
export function createCrowd(scene: Scene) {
  const scratch = new Color();
  const batches = new Map<BakedPart, Batch>();

  function batchFor(part: BakedPart): Batch {
    let batch = batches.get(part);
    if (batch === undefined || batch.count === batch.mesh.instanceMatrix.count) {
      batch = grow(part, batch);
      batches.set(part, batch);
    }
    return batch;
  }

  function grow(part: BakedPart, old: Batch | undefined): Batch {
    const capacity = old === undefined ? 16 : old.mesh.instanceMatrix.count * 2;
    const mesh = new InstancedMesh(part.geometry, part.material, capacity);
    mesh.frustumCulled = false;
    const playing = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const leaving = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    if (old !== undefined) {
      playing.array.set(old.playing.array);
      leaving.array.set(old.leaving.array);
      mesh.instanceMatrix.array.set(old.mesh.instanceMatrix.array);
      for (let index = 0; old.mesh.instanceColor !== null && index < old.count; index++) {
        mesh.setColorAt(index, old.mesh.getColorAt(index, scratch));
      }
      scene.remove(old.mesh);
      old.mesh.dispose();
    }
    part.geometry.setAttribute("bakedA", playing);
    part.geometry.setAttribute("bakedB", leaving);
    scene.add(mesh);
    return { mesh, playing, leaving, count: old?.count ?? 0 };
  }

  return {
    begin(): void {
      for (const batch of batches.values()) batch.count = 0;
    },

    add(model: BakedModel, matrix: Matrix4, color: Color, [playing, leaving]: BakedPose): void {
      for (const part of model.parts) {
        const batch = batchFor(part);
        const index = batch.count++;
        batch.mesh.setMatrixAt(index, matrix);
        if (part.team) batch.mesh.setColorAt(index, color);
        batch.playing.setXYZW(index, ...playing);
        batch.leaving.setXYZW(index, ...leaving, 0);
      }
    },

    end(): void {
      for (const batch of batches.values()) {
        batch.mesh.count = batch.count;
        batch.mesh.instanceMatrix.needsUpdate = true;
        if (batch.mesh.instanceColor !== null) batch.mesh.instanceColor.needsUpdate = true;
        batch.playing.needsUpdate = true;
        batch.leaving.needsUpdate = true;
      }
    },

    dispose(): void {
      for (const batch of batches.values()) {
        scene.remove(batch.mesh);
        batch.mesh.dispose();
      }
      batches.clear();
    },
  };
}
