import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  SrcAlphaFactor,
  type Blending,
  type Scene,
} from "three";

/** Value noise and three octaves of it, shared by the effect shaders. */
const NOISE = /* glsl */ `
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
        mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
        mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  return 0.5 * noise3(p) + 0.3 * noise3(p * 2.03) + 0.2 * noise3(p * 4.01);
}
`;

/** The shapes a quad can draw. */
export const SHAPES = { glow: 0, ring: 1, puff: 2, scorch: 3, flare: 4 } as const;
export type Shape = keyof typeof SHAPES;

const QUAD_VERTEX = /* glsl */ `
attribute vec3 iCenter;
attribute float iSize;
attribute vec4 iColor;
// Rotation, shape, flat on the ground, and a seed for the noise.
attribute vec4 iParams;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vSeed;
void main() {
  float c = cos(iParams.x);
  float s = sin(iParams.x);
  vec2 p = mat2(c, s, -s, c) * position.xy * iSize;
  if (iParams.z > 0.5) {
    gl_Position = projectionMatrix * viewMatrix * vec4(iCenter + vec3(p.x, 0.0, p.y), 1.0);
  } else {
    vec4 view = viewMatrix * vec4(iCenter, 1.0);
    view.xy += p;
    gl_Position = projectionMatrix * view;
  }
  vUv = uv;
  vColor = iColor;
  vShape = iParams.y;
  vSeed = iParams.w;
}
`;

const QUAD_FRAGMENT = /* glsl */ `
${NOISE}
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vSeed;
void main() {
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  float a;
  if (vShape < 0.5) {
    a = pow(clamp(1.0 - d, 0.0, 1.0), 2.0);
  } else if (vShape < 1.5) {
    a = clamp(1.0 - abs(d - 0.8) / 0.14, 0.0, 1.0);
    a *= a;
  } else if (vShape < 2.5) {
    float n = fbm3(vec3(c * 3.0, vSeed));
    a = 1.0 - smoothstep(0.3, 1.0, d + (n - 0.5) * 0.8);
  } else if (vShape < 3.5) {
    float n = fbm3(vec3(c * 4.0, vSeed));
    a = 1.0 - smoothstep(0.15, 1.0, d + (n - 0.5) * 1.0);
  } else {
    float rays = max(1.0 - abs(c.x) * 12.0, 0.0) + max(1.0 - abs(c.y) * 12.0, 0.0);
    a = clamp(pow(clamp(1.0 - d, 0.0, 1.0), 3.0) + rays * clamp(1.0 - d, 0.0, 1.0), 0.0, 1.0);
  }
  if (a * vColor.a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  #include <colorspace_fragment>
}
`;

const BEAM_VERTEX = /* glsl */ `
attribute vec3 iStart;
attribute vec3 iEnd;
attribute float iWidth;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec3 axis = iEnd - iStart;
  vec3 middle = iStart + axis * position.x;
  vec3 side = cross(axis, cameraPosition - middle);
  float length2 = dot(side, side);
  side = length2 > 1e-10 ? side * inversesqrt(length2) : vec3(1.0, 0.0, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(middle + side * position.y * iWidth, 1.0);
  vUv = uv;
  vColor = iColor;
}
`;

const BEAM_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float core = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float ends = smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));
  vec3 color = mix(vColor.rgb, vec3(1.0), pow(core, 12.0) * 0.35);
  gl_FragColor = vec4(color, vColor.a * pow(core, 1.6) * ends);
  #include <colorspace_fragment>
}
`;

const FIREBALL_VERTEX = /* glsl */ `
${NOISE}
attribute vec3 iCenter;
// Radius, progress from birth to death, seed.
attribute vec3 iShape;
attribute vec3 iHot;
attribute vec3 iCool;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vShapeOut;
varying vec3 vHot;
varying vec3 vCool;
void main() {
  float n = fbm3(normal * 1.8 + vec3(iShape.z * 13.1, iShape.y * 1.5, 0.0));
  vec3 displaced = position * (0.75 + 0.55 * n);
  gl_Position = projectionMatrix * viewMatrix * vec4(iCenter + displaced * iShape.x, 1.0);
  vLocal = normal;
  vNormal = normalize((viewMatrix * vec4(normal, 0.0)).xyz);
  vShapeOut = iShape;
  vHot = iHot;
  vCool = iCool;
}
`;

const FIREBALL_FRAGMENT = /* glsl */ `
${NOISE}
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vShapeOut;
varying vec3 vHot;
varying vec3 vCool;
void main() {
  float progress = vShapeOut.y;
  float n = fbm3(vLocal * 1.8 + vec3(vShapeOut.z * 7.3, progress * 1.5, 0.0));
  // It burns away from the thinnest noise outward as it ages.
  float threshold = mix(0.2, 0.8, pow(progress, 1.3));
  if (n < threshold) discard;
  // Hottest where it faces the camera, cooler and darker toward its rim, so it reads as a volume.
  float facing = clamp(abs(normalize(vNormal).z), 0.0, 1.0);
  float heat = clamp((n - threshold) * 3.5 + (1.0 - progress) * 0.45 - 0.55 + facing * 0.4, 0.0, 1.0);
  // Cool, then a darker hot, then hot, then a touch of white at the very hottest.
  // Between cool and hot, so a white burst shades to ice, not grey.
  vec3 ember = mix(vCool, vHot, 0.55);
  vec3 color = heat < 0.5 ? mix(vCool, ember, heat * 2.0) : mix(ember, vHot, heat * 2.0 - 1.0);
  // Where it burns away the edge glows, as paper does, instead of outlining the hole in soot.
  color = mix(mix(ember, vHot, 0.5), color, smoothstep(0.0, 0.05, n - threshold));
  color = mix(color, vec3(1.0, 0.95, 0.82), pow(heat, 12.0) * 0.3 * (1.0 - progress));
  color = mix(mix(vCool, ember, 0.5), color, mix(0.35, 1.0, pow(facing, 0.6)));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

/** Instances of one shape with float attributes, refilled every frame, up to a fixed budget. */
function createBatch(
  scene: Scene,
  base: BufferGeometry,
  material: ShaderMaterial,
  layout: Readonly<Record<string, number>>,
  capacity: number,
  renderOrder: number,
) {
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  for (const [name, attribute] of Object.entries(base.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  const attributes: Record<string, InstancedBufferAttribute> = {};
  for (const [name, size] of Object.entries(layout)) {
    const attribute = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
    attribute.setUsage(DynamicDrawUsage);
    attributes[name] = attribute;
    geometry.setAttribute(name, attribute);
  }
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  let count = 0;

  return {
    capacity,
    get count() {
      return count;
    },
    begin(): void {
      count = 0;
    },
    /** The index of a new instance, or -1 when the budget is spent. */
    add(): number {
      return count < capacity ? count++ : -1;
    },
    write(name: string, index: number, ...values: number[]): void {
      const attribute = attributes[name];
      (attribute.array as Float32Array).set(values, index * attribute.itemSize);
    },
    end(): void {
      geometry.instanceCount = count;
      mesh.visible = count > 0;
      for (const attribute of Object.values(attributes)) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, count * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    },
    dispose(): void {
      scene.remove(mesh);
      geometry.dispose();
      base.dispose();
      material.dispose();
    },
  };
}

export type Batch = ReturnType<typeof createBatch>;

function quadMaterial(blending: Blending): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: QUAD_FRAGMENT,
    // A quad laid on the ground faces down, so it must draw from either side.
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending,
  });
}

/**
 * Smoke and scorch blend over the ground but never over a unit's body. They
 * join the opaque pass just after the ground, so every model draws over them.
 */
function shadeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: QUAD_FRAGMENT,
    side: DoubleSide,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
  });
}

/** The ground draws first, then shade, then everything else. */
export const GROUND_ORDER = -2;
const SHADE_ORDER = -1;

const QUAD_LAYOUT = { iCenter: 3, iSize: 1, iColor: 4, iParams: 4 };

/** Camera-facing or ground-flat quads that add light: flashes, glows, sparks' heads, rings. */
export function createLightQuads(scene: Scene, capacity: number): Batch {
  return createBatch(
    scene,
    new PlaneGeometry(1, 1),
    quadMaterial(AdditiveBlending),
    QUAD_LAYOUT,
    capacity,
    3,
  );
}

/** Quads that darken the ground: smoke and scorch marks. */
export function createShadeQuads(scene: Scene, capacity: number): Batch {
  return createBatch(
    scene,
    new PlaneGeometry(1, 1),
    shadeMaterial(),
    QUAD_LAYOUT,
    capacity,
    SHADE_ORDER,
  );
}

/** Ribbons between two points that turn their face to the camera: lasers, tracers, sparks. */
export function createBeams(scene: Scene, capacity: number): Batch {
  const base = new BufferGeometry();
  base.setAttribute(
    "position",
    new Float32BufferAttribute([0, -0.5, 0, 1, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0], 3),
  );
  base.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  base.setIndex([0, 1, 2, 2, 1, 3]);
  const material = new ShaderMaterial({
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    // The ribbon turns to the camera, so which way round it winds depends on the beam's direction.
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return createBatch(
    scene,
    base,
    material,
    { iStart: 3, iEnd: 3, iWidth: 1, iColor: 4 },
    capacity,
    2,
  );
}

/**
 * Lumpy spheres that burn away: an explosion's body. They are solid where they
 * draw, so a big one shades each pixel once instead of stacking quads.
 */
export function createFireballs(scene: Scene, capacity: number): Batch {
  const material = new ShaderMaterial({
    vertexShader: FIREBALL_VERTEX,
    fragmentShader: FIREBALL_FRAGMENT,
  });
  return createBatch(
    scene,
    // 320 triangles, so a full budget of fireballs stays within a phone's share.
    new IcosahedronGeometry(1, 2),
    material,
    { iCenter: 3, iShape: 3, iHot: 3, iCool: 3 },
    capacity,
    0,
  );
}

/** Lit chunks thrown by an explosion. */
export function createDebris(scene: Scene, capacity: number) {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshLambertMaterial();
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new Color());
  scene.add(mesh);
  let count = 0;
  return {
    capacity,
    get count() {
      return count;
    },
    begin(): void {
      count = 0;
    },
    add(matrix: Matrix4, color: Color): void {
      if (count === capacity) return;
      mesh.setMatrixAt(count, matrix);
      mesh.setColorAt(count, color);
      count += 1;
    },
    end(): void {
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    },
    dispose(): void {
      scene.remove(mesh);
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
