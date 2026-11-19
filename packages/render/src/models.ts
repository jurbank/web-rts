import {
  Box3,
  DataTexture,
  HalfFloatType,
  Mesh,
  RGBAFormat,
  type BufferGeometry,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from "three";
import { GLTFLoader, type GLTF, type GLTFParser } from "three/addons/loaders/GLTFLoader.js";
import type { BakedClip } from "./clips.ts";

/** A model drawn as authored, such as a building or a vehicle. */
export interface RigidModel {
  readonly kind: "rigid";
  readonly scene: Object3D;
  /** The gameplay radius it was built for. */
  readonly radius: number;
}

export interface BakedPart {
  readonly geometry: BufferGeometry;
  readonly material: MeshStandardMaterial;
  /** Takes the owner's color. */
  readonly team: boolean;
}

/** A creature whose clips were baked into vertex frames, played by the vertex shader. */
export interface BakedModel {
  readonly kind: "baked";
  readonly parts: readonly BakedPart[];
  readonly clips: Readonly<Record<string, BakedClip>>;
  readonly rate: number;
  readonly radius: number;
}

export type Model = RigidModel | BakedModel;

/** The `extras.frames` a creature export writes on its mesh node. */
interface FramesExtras {
  rate: number;
  vertices: number;
  positions: number;
  normals: number;
  clips: Record<string, BakedClip>;
}

const TEXTURE_SLOTS = [
  "map",
  "emissiveMap",
  "metalnessMap",
  "roughnessMap",
  "normalMap",
  "aoMap",
] as const;

const BAKED_VERTEX = /* glsl */ `
attribute float _vertex;
attribute vec4 bakedA;
attribute vec4 bakedB;
uniform highp sampler2D bakedPositions;
uniform highp sampler2D bakedNormals;
vec3 bakedRow(highp sampler2D frames, float row) {
  return texelFetch(frames, ivec2(int(_vertex + 0.5), int(row + 0.5)), 0).xyz;
}
// bakedA is the playing clip's two rows, the step between them, and its weight. bakedB is the clip it blends from.
vec3 baked(highp sampler2D frames) {
  vec3 playing = mix(bakedRow(frames, bakedA.x), bakedRow(frames, bakedA.y), bakedA.z);
  vec3 leaving = mix(bakedRow(frames, bakedB.x), bakedRow(frames, bakedB.y), bakedB.z);
  return mix(leaving, playing, bakedA.w);
}
`;

/**
 * Loads GLBs once per URL. Files of one set embed the same atlas images, so
 * textures with identical bytes are shared, and the GPU holds each atlas once.
 */
export function createModelLibrary() {
  const loader = new GLTFLoader();
  const entries = new Map<string, Model | "loading" | "failed">();
  const textures = new Map<string, Texture>();
  const disposables = new Set<{ dispose(): void }>();
  let disposed = false;

  async function load(url: string): Promise<Model> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const gltf = await loader.parseAsync(
      await response.arrayBuffer(),
      url.slice(0, url.lastIndexOf("/") + 1),
    );
    await shareTextures(gltf);
    return toModel(gltf);
  }

  async function shareTextures({ parser, scene }: GLTF): Promise<void> {
    const images: { bufferView?: number; uri?: string }[] = parser.json.images ?? [];
    const sources = await Promise.all(
      images.map(async (image) =>
        image.bufferView === undefined
          ? String(image.uri)
          : fingerprint(await parser.getDependency("bufferView", image.bufferView)),
      ),
    );
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const material = object.material as MeshStandardMaterial;
      for (const slot of TEXTURE_SLOTS) {
        const texture = material[slot];
        if (texture === null) continue;
        const index = parser.associations.get(texture)?.textures;
        if (index === undefined) continue;
        const source = sources[parser.json.textures[index].source];
        const key = `${source}:${texture.colorSpace}:${texture.channel}:${texture.flipY}`;
        const shared = textures.get(key);
        if (shared === undefined) {
          textures.set(key, texture);
          disposables.add(texture);
        } else {
          material[slot] = shared;
        }
      }
      disposables.add(object.geometry);
      disposables.add(material);
    });
  }

  async function toModel({ parser, scene }: GLTF): Promise<Model> {
    const radius = typeof scene.userData.radius === "number" ? scene.userData.radius : reach(scene);
    let host: Object3D | undefined;
    scene.traverse((object) => {
      if (object.userData.frames !== undefined) host = object;
    });
    if (host === undefined) return { kind: "rigid", scene, radius };

    const frames = host.userData.frames as FramesExtras;
    const positions = await frameTexture(parser, frames.positions, frames.vertices);
    const normals = await frameTexture(parser, frames.normals, frames.vertices);
    const parts: BakedPart[] = [];
    host.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const source = object.material as MeshStandardMaterial;
      const material = source.clone();
      material.onBeforeCompile = (shader) => {
        shader.uniforms.bakedPositions = { value: positions };
        shader.uniforms.bakedNormals = { value: normals };
        shader.vertexShader =
          BAKED_VERTEX +
          shader.vertexShader
            .replace(
              "#include <beginnormal_vertex>",
              "#include <beginnormal_vertex>\n\tobjectNormal = normalize(baked(bakedNormals));",
            )
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\n\ttransformed = baked(bakedPositions);",
            );
      };
      material.customProgramCacheKey = () => "baked";
      disposables.add(material);
      parts.push({ geometry: object.geometry, material, team: source.name === "team" });
    });
    disposables.add(positions);
    disposables.add(normals);
    return { kind: "baked", parts, clips: frames.clips, rate: frames.rate, radius };
  }

  return {
    /** The model at `url`, or undefined until it has loaded. A file that fails stays undefined. */
    get(url: string): Model | undefined {
      const entry = entries.get(url);
      if (entry === undefined) {
        entries.set(url, "loading");
        load(url).then(
          (model) => {
            if (!disposed) entries.set(url, model);
          },
          (error: unknown) => {
            console.warn(`Model ${url} did not load, so it draws as a box`, error);
            entries.set(url, "failed");
          },
        );
        return undefined;
      }
      return typeof entry === "string" ? undefined : entry;
    },

    /** Whether any model asked for is still on its way. */
    get loading(): boolean {
      for (const entry of entries.values()) if (entry === "loading") return true;
      return false;
    },

    dispose(): void {
      disposed = true;
      for (const item of disposables) item.dispose();
      disposables.clear();
      textures.clear();
      entries.clear();
    },
  };
}

export type ModelLibrary = ReturnType<typeof createModelLibrary>;

async function frameTexture(
  parser: GLTFParser,
  bufferView: number,
  vertices: number,
): Promise<DataTexture> {
  const data = new Uint16Array(await parser.getDependency("bufferView", bufferView));
  const texture = new DataTexture(
    data,
    vertices,
    data.length / 4 / vertices,
    RGBAFormat,
    HalfFloatType,
  );
  texture.needsUpdate = true;
  return texture;
}

/** How far a model reaches from its origin across the ground, for exports that do not record their radius. */
function reach(scene: Object3D): number {
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  return Math.max(-bounds.min.x, bounds.max.x, -bounds.min.z, bounds.max.z);
}

/** FNV-1a of the bytes, with their length. */
function fingerprint(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index++) {
    hash = Math.imul(hash ^ bytes[index], 0x01000193);
  }
  return `${bytes.length}-${(hash >>> 0).toString(16)}`;
}
