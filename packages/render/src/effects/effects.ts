import { Color, Euler, Matrix4, Quaternion, Vector3, type Scene } from "three";
import {
  createBeams,
  createDebris,
  createFireballs,
  createLightQuads,
  createShadeQuads,
  SHAPES,
} from "./blocks.ts";
import {
  BLOCK_SHAPES,
  type Aim,
  type Block,
  type Emitter,
  type Range,
  type Recipe,
} from "./recipes.ts";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Where an effect plays. */
export interface Anchors {
  /** Where it starts, such as a muzzle. Null when the viewer cannot see it. */
  readonly origin: Vec3 | null;
  /** Where it lands, such as an impact or a death. Null when the viewer cannot see it. */
  readonly target: Vec3 | null;
  /** The way a shot went when its target is hidden. */
  readonly direction: Vec3 | null;
  /** How far a shot with a hidden target reaches. */
  readonly reach: number;
  readonly scale: number;
  /** The same seed draws the same effect. */
  readonly seed: number;
}

/**
 * Every effect's budget. The same on every device, so a phone draws every shot a
 * desktop does. Past it, new parts are skipped.
 */
const BUDGET = { light: 1024, shade: 512, beams: 512, fireballs: 128, debris: 256 };
const MAX_PARTICLES = 4096;
/**
 * Parts that dress an effect without telling what happened. When a budget is
 * full they give way, so a shot's flash, tracer, or beam is never the part skipped.
 */
const DECORATION: ReadonlySet<Block> = new Set([
  "smoke",
  "scorch",
  "debris",
  "spark",
  "light",
  "ring",
]);
const GROUND_LIFT = 0.03;
const UP = new Vector3(0, 1, 0);

interface Particle {
  block: Block;
  age: number;
  life: number;
  position: Vector3;
  velocity: Vector3;
  rise: number;
  drag: number;
  sizes: readonly [number, number];
  colors: readonly [Color, Color];
  opacity: readonly [number, number];
  rotation: number;
  spin: number;
  seed: number;
  /** A chunk's length over its width. */
  stretch: number;
  /** Whether a frame has drawn it, so a part shorter than a frame still shows once. */
  drawn: boolean;
  /** A beam's or tracer's path. */
  start: Vector3;
  end: Vector3;
}

/** Seeded draws, so a shot looks the same on every device and in a replay. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEffects(scene: Scene) {
  const light = createLightQuads(scene, BUDGET.light);
  const shade = createShadeQuads(scene, BUDGET.shade);
  const beams = createBeams(scene, BUDGET.beams);
  const fireballs = createFireballs(scene, BUDGET.fireballs);
  const debris = createDebris(scene, BUDGET.debris);
  const colors = new Map<string, Color>();
  let particles: Particle[] = [];

  const scratch = new Color();
  const tail = new Vector3();
  const head = new Vector3();
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler();
  const size = new Vector3();

  function colorOf(style: string): Color {
    let color = colors.get(style);
    if (color === undefined) {
      color = new Color(style);
      colors.set(style, color);
    }
    return color;
  }

  function emit(emitter: Emitter, anchors: Anchors, random: () => number, elapsed: number): void {
    const pick = (range: Range | undefined, fallback = 0) =>
      range === undefined
        ? fallback
        : typeof range === "number"
          ? range
          : range[0] + (range[1] - range[0]) * random();
    const { origin, scale } = anchors;
    const travels = emitter.block === "beam" || emitter.block === "tracer";
    const end =
      anchors.target ??
      (origin !== null && anchors.direction !== null
        ? {
            x: origin.x + anchors.direction.x * anchors.reach,
            y: origin.y,
            z: origin.z + anchors.direction.z * anchors.reach,
          }
        : null);
    const anchor = travels || emitter.at === "origin" ? origin : anchors.target;
    if (anchor === null || (travels && end === null)) return;
    const forward = new Vector3();
    if (origin !== null && end !== null) forward.set(end.x - origin.x, 0, end.z - origin.z);
    else if (anchors.direction !== null) forward.set(anchors.direction.x, 0, anchors.direction.z);
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
    forward.normalize();
    const right = new Vector3(-forward.z, 0, forward.x);

    const count = Math.round(pick(emitter.count, 1));
    for (let index = 0; index < count; index++) {
      // Core parts may pass the budget until the next update evicts decoration for them.
      if (particles.length >= MAX_PARTICLES && DECORATION.has(emitter.block)) return;
      const scatter = pick(emitter.scatter) * scale * Math.sqrt(random());
      const around = random() * Math.PI * 2;
      const side = pick(emitter.side) * scale;
      const position = new Vector3(
        anchor.x + Math.cos(around) * scatter + right.x * side,
        anchor.y + pick(emitter.lift) * scale,
        anchor.z + Math.sin(around) * scatter + right.z * side,
      );
      const velocity = direction(emitter.aim ?? "out", emitter.spread ?? 0, forward, random);
      const life = Math.max(0.01, pick(emitter.life));
      const speed =
        emitter.arrive && end !== null
          ? Math.hypot(end.x - position.x, end.z - position.z) / life
          : pick(emitter.speed) * scale;
      velocity.multiplyScalar(speed);
      const [birth, death] = emitter.size;
      particles.push({
        block: emitter.block,
        age: elapsed - pick(emitter.delay),
        life,
        position,
        velocity,
        rise: pick(emitter.rise) * scale,
        drag: emitter.drag ?? 0,
        sizes: [pick(birth) * scale, pick(death) * scale],
        colors: [colorOf(emitter.color[0]), colorOf(emitter.color[1])],
        opacity: emitter.opacity ?? [1, 0],
        rotation: random() * Math.PI * 2,
        spin: pick(emitter.spin),
        seed: random() * 100,
        drawn: false,
        stretch: emitter.stretch ?? 1,
        start: new Vector3(
          (origin?.x ?? 0) + right.x * side,
          origin?.y ?? 0,
          (origin?.z ?? 0) + right.z * side,
        ),
        end: new Vector3(end?.x ?? 0, end?.y ?? 0, end?.z ?? 0),
      });
    }
  }

  /** Past the budget, the oldest decoration goes first, so every shot keeps its parts. */
  function evictDecoration(): void {
    let excess = particles.length - MAX_PARTICLES;
    if (excess <= 0) return;
    particles = particles.filter((particle) => {
      if (excess > 0 && DECORATION.has(particle.block)) {
        excess -= 1;
        return false;
      }
      return true;
    });
  }

  function advance(particle: Particle, dt: number): void {
    const { velocity, position } = particle;
    velocity.y += particle.rise * dt;
    velocity.multiplyScalar(Math.max(0, 1 - particle.drag * dt));
    position.addScaledVector(velocity, dt);
    particle.rotation += particle.spin * dt;
    if (particle.block === "debris") {
      const half = particle.sizes[0] / 2;
      if (position.y < half) {
        position.y = half;
        velocity.set(velocity.x * 0.6, Math.abs(velocity.y) * 0.35, velocity.z * 0.6);
        particle.spin *= 0.7;
      }
    }
  }

  function draw(particle: Particle, t: number): void {
    const width = particle.sizes[0] + (particle.sizes[1] - particle.sizes[0]) * t;
    const opacity = particle.opacity[0] + (particle.opacity[1] - particle.opacity[0]) * t;
    const color = scratch.copy(particle.colors[0]).lerp(particle.colors[1], t);
    const { position, block } = particle;
    switch (block) {
      case "glow":
      case "flare":
      case "light":
      case "ring":
      case "smoke":
      case "scorch": {
        const flat = block === "light" || block === "ring" || block === "scorch";
        const batch = block === "smoke" || block === "scorch" ? shade : light;
        const index = batch.add();
        if (index < 0) return;
        const y = flat ? GROUND_LIFT + (block === "scorch" ? 0 : 0.005) : position.y;
        batch.write("iCenter", index, position.x, y, position.z);
        batch.write("iSize", index, width);
        batch.write("iColor", index, color.r, color.g, color.b, opacity);
        batch.write(
          "iParams",
          index,
          particle.rotation,
          SHAPES[BLOCK_SHAPES[block]!],
          flat ? 1 : 0,
          particle.seed,
        );
        return;
      }
      case "beam":
      case "tracer":
      case "spark": {
        const index = beams.add();
        if (index < 0) return;
        let from: Vector3;
        let to: Vector3;
        if (block === "beam") {
          from = particle.start;
          to = particle.end;
        } else if (block === "tracer") {
          to = head.copy(particle.start).lerp(particle.end, Math.min(1, t * 1.2));
          const length = Math.min(particle.sizes[0], to.distanceTo(particle.start));
          const way = tail.copy(particle.end).sub(particle.start).normalize();
          from = way.multiplyScalar(-length).add(to);
        } else {
          to = position;
          const speed = particle.velocity.length();
          from =
            speed < 1e-6
              ? position
              : tail.copy(position).addScaledVector(particle.velocity, -width / speed);
        }
        const beamWidth = block === "beam" ? width : block === "tracer" ? 0.08 : 0.05;
        beams.write("iStart", index, from.x, from.y, from.z);
        beams.write("iEnd", index, to.x, to.y, to.z);
        beams.write("iWidth", index, beamWidth);
        beams.write("iColor", index, color.r, color.g, color.b, opacity);
        return;
      }
      case "fireball": {
        const index = fireballs.add();
        if (index < 0) return;
        const [hot, cool] = particle.colors;
        fireballs.write("iCenter", index, position.x, position.y, position.z);
        fireballs.write("iShape", index, width, t, particle.seed);
        fireballs.write("iHot", index, hot.r, hot.g, hot.b);
        fireballs.write("iCool", index, cool.r, cool.g, cool.b);
        return;
      }
      case "debris": {
        // A chunk shrinks into the ground over the last fifth of its life.
        const shrink = Math.min(1, (1 - t) * 5);
        euler.set(particle.rotation, particle.rotation * 0.7, particle.seed);
        rotation.setFromEuler(euler);
        const edge = particle.sizes[0] * shrink;
        matrix.compose(
          position,
          rotation,
          size.set(edge, edge / Math.sqrt(particle.stretch), edge * particle.stretch),
        );
        debris.add(matrix, color);
        return;
      }
    }
  }

  return {
    /**
     * Starts every part of a recipe. Delayed parts wait their turn. `elapsed` is
     * how long ago its event happened, so a frame that catches up on several
     * ticks plays each as far along as a faster device would.
     */
    play(recipe: Recipe, anchors: Anchors, elapsed = 0): void {
      const random = mulberry32(anchors.seed);
      for (const emitter of recipe.emitters) emit(emitter, anchors, random, elapsed);
    },

    /** Moves every live part on by `dt` seconds and fills the batches to draw. */
    update(dt: number): void {
      for (const batch of [light, shade, beams, fireballs, debris]) batch.begin();
      particles = particles.filter((particle) => {
        particle.age += dt;
        if (particle.age >= particle.life) {
          if (particle.drawn) return false;
          // A slow frame shows a part shorter than itself once, as it was born.
          particle.age = 0;
        }
        if (particle.age >= 0) advance(particle, dt);
        return true;
      });
      evictDecoration();
      // What tells the event draws first, so a full batch drops decoration.
      for (const decoration of [false, true]) {
        for (const particle of particles) {
          if (particle.age < 0 || DECORATION.has(particle.block) !== decoration) continue;
          particle.drawn = true;
          draw(particle, particle.age / particle.life);
        }
      }
      for (const batch of [light, shade, beams, fireballs, debris]) batch.end();
    },

    get live(): number {
      return particles.length;
    },

    clear(): void {
      particles = [];
    },

    dispose(): void {
      for (const batch of [light, shade, beams, fireballs, debris]) batch.dispose();
      particles = [];
    },
  };
}

export type Effects = ReturnType<typeof createEffects>;

/** A unit vector for an emitter's aim, within its cone. */
function direction(aim: Aim, spread: number, forward: Vector3, random: () => number): Vector3 {
  if (aim === "out") {
    const y = random();
    const around = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - y * y);
    return new Vector3(Math.cos(around) * ring, y, Math.sin(around) * ring);
  }
  const axis = aim === "up" ? UP.clone() : forward.clone().multiplyScalar(aim === "back" ? -1 : 1);
  if (spread <= 0) return axis;
  const cosine = 1 - random() * (1 - Math.cos(spread));
  const sine = Math.sqrt(1 - cosine * cosine);
  const around = random() * Math.PI * 2;
  const side = Math.abs(axis.y) > 0.9 ? new Vector3(1, 0, 0) : UP.clone();
  const u = side.cross(axis).normalize();
  const v = axis.clone().cross(u);
  return axis
    .multiplyScalar(cosine)
    .addScaledVector(u, Math.cos(around) * sine)
    .addScaledVector(v, Math.sin(around) * sine);
}
