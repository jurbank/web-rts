import type { Snapshot } from "sim";
import { DataTexture, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";

/** A ground overlay. Picking still uses only the live entities in the viewer's snapshot. */
export function createFogLayer(geometry: PlaneGeometry, width: number, height: number) {
  const material = new MeshBasicMaterial({ color: 0x080c10, transparent: true, depthWrite: false });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(width / 2, 0.015, height / 2);
  mesh.visible = false;
  let texture: DataTexture | undefined;
  let previous: Snapshot["fog"];
  return {
    mesh,
    update(fog: Snapshot["fog"]) {
      if (fog === previous) return;
      previous = fog;
      mesh.visible = fog !== undefined;
      if (!fog) return;
      const { columns, rows, visible, explored } = fog;
      if (!texture || texture.image.width !== columns || texture.image.height !== rows) {
        texture?.dispose();
        texture = new DataTexture(new Uint8Array(columns * rows * 4), columns, rows);
        texture.magFilter = LinearFilter;
        material.alphaMap = texture;
        material.needsUpdate = true;
      }
      const pixels = texture.image.data!;
      for (let row = 0; row < rows; row++) {
        for (let x = 0; x < columns; x++) {
          const cell = row * columns + x;
          const bit = 1 << (cell & 31);
          const opacity =
            (visible[cell >>> 5] & bit) !== 0 ? 0 : (explored[cell >>> 5] & bit) !== 0 ? 142 : 250;
          // alphaMap samples green. Map y grows toward the bottom of the plane's UVs.
          pixels[((rows - row - 1) * columns + x) * 4 + 1] = opacity;
        }
      }
      texture.needsUpdate = true;
    },
    dispose() {
      texture?.dispose();
      material.dispose();
    },
  };
}
