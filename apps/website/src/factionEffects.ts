import { DEATH_KINDS, RECIPES, SHOT_KINDS, type Emitter, type Recipe } from "render";

type Block = Emitter["block"];
type Kind = keyof typeof RECIPES;

type Changes = Partial<Record<Block, ((emitter: Emitter) => Partial<Emitter>) | null>>;

/**
 * How a faction redraws a generic recipe, block by block: a change to each
 * emitter of that block, or null to leave the block out. `kinds` changes a
 * block further in one kind only, such as a missile's impact. `add` appends
 * parts of the faction's own.
 */
interface Style {
  readonly blocks: Changes;
  readonly kinds?: Partial<Record<Kind, Changes>>;
  readonly add?: Partial<Record<Kind, readonly Emitter[]>>;
}

function restyle(kind: Kind, { blocks, kinds, add }: Style): Recipe {
  const base: Recipe = RECIPES[kind];
  const emitters = base.emitters.flatMap((emitter) => {
    let styled = emitter;
    for (const changes of [blocks, kinds?.[kind] ?? {}]) {
      const change = changes[emitter.block];
      if (change === null) return [];
      if (change !== undefined) styled = { ...styled, ...change(styled) };
    }
    return [styled];
  });
  return { ...base, emitters: [...emitters, ...(add?.[kind] ?? [])] };
}

const KINDS: readonly Kind[] = [...SHOT_KINDS, ...DEATH_KINDS];

const scaled = (range: Emitter["life"], factor: number): Emitter["life"] =>
  typeof range === "number" ? range * factor : [range[0] * factor, range[1] * factor];

/** White light with a pale ice edge. No fire, soot, or lasting scorch. */
const UTOPIAN: Style = {
  blocks: {
    flare: () => ({ color: ["#ffffff", "#d6f2f0"] }),
    glow: () => ({ color: ["#ffffff", "#a8dce6"] }),
    tracer: () => ({ color: ["#ffffff", "#d6f2f0"], size: [1, 1] }),
    beam: () => ({ color: ["#ffffff", "#a8dce6"] }),
    arc: () => ({ color: ["#ffffff", "#a8dce6"] }),
    spark: () => ({ color: ["#ffffff", "#d6f2f0"], rise: 0, drag: 3 }),
    light: () => ({ color: ["#d6f2f0", "#7cc4d8"] }),
    ring: (emitter) => ({ color: ["#ffffff", "#d6f2f0"], size: [emitter.size[1], 0.3] }),
    // A burst flares at once, then collapses inward as it burns away.
    fireball: (emitter) => ({
      color: ["#ffffff", "#c8dde2"],
      size: [emitter.size[1], scaled(emitter.size[0], 0.3)],
      life: scaled(emitter.life, 0.6),
    }),
    debris: (emitter) => ({
      color: ["#f1f4f5", "#d9e0e2"],
      life: scaled(emitter.life, 0.5),
      stretch: 1.6,
    }),
    smoke: (emitter) => ({
      color: ["#d6e4e8", "#c3d3d8"],
      opacity: [0.2, 0],
      life: scaled(emitter.life, 0.5),
      delay: 0,
    }),
    scorch: null,
  },
  // A missile's hit is a clean ring and sparks, not a fireball.
  kinds: { missile: { fireball: null } },
  add: {
    bullet: [
      { block: "ring", delay: 0.06, life: 0.3, size: [0.3, 1.2], color: ["#ffffff", "#d6f2f0"] },
    ],
    laser: [{ block: "ring", life: 0.35, size: [0.4, 1.6], color: ["#ffffff", "#d6f2f0"] }],
    lightning: [{ block: "ring", life: 0.3, size: [0.3, 1.4], color: ["#ffffff", "#d6f2f0"] }],
    missile: [
      { block: "ring", delay: 0.2, life: 0.4, size: [0.4, 1.8], color: ["#ffffff", "#d6f2f0"] },
      {
        block: "spark",
        delay: 0.2,
        count: 3,
        life: [0.15, 0.3],
        size: [0.35, 0.06],
        color: ["#ffffff", "#d6f2f0"],
        speed: [3, 5],
        aim: "out",
        drag: 3,
      },
    ],
  },
};

/** Thin ice-blue light with a white core, rose crimson sparks, sharp shards. */
const SAMURAI: Style = {
  blocks: {
    flare: () => ({ color: ["#cfeaf5", "#8bc5de"] }),
    glow: (emitter) => ({
      color: ["#cfeaf5", "#8bc5de"],
      size: [scaled(emitter.size[0], 0.7), emitter.size[1]],
    }),
    tracer: () => ({ color: ["#bfe3f2", "#5a9fc2"], size: [1.4, 1.4] }),
    // Both rails of a forked emitter fire and meet at the target.
    beam: () => ({ color: ["#a8d8ec", "#5a9fc2"], side: 0.3, size: [0.12, 0.03] }),
    arc: () => ({ color: ["#cfeaf5", "#8bc5de"] }),
    spark: () => ({ color: ["#ec8f98", "#d96973"], size: [0.4, 0.08], count: [4, 6] }),
    light: () => ({ color: ["#8bc5de", "#2d5a78"] }),
    ring: () => ({ color: ["#8bc5de", "#2d5a78"] }),
    fireball: () => ({ color: ["#e8f7ff", "#5f8aa6"] }),
    debris: (emitter) => ({
      color: ["#1d2330", "#14181f"],
      size: [emitter.size[0], 0.06],
      stretch: 2.5,
    }),
    smoke: (emitter) => ({
      color: ["#7d8892", "#5a646e"],
      opacity: [0.4, 0],
      life: scaled(emitter.life, 0.45),
    }),
  },
  // A missile is a short head, so it never reads as the laser, and it hits in crimson sparks.
  kinds: {
    missile: {
      tracer: () => ({ size: [0.45, 0.45] }),
      fireball: null,
      spark: (emitter) => ({ count: [6, 8], size: [0.5, 0.1], life: emitter.life }),
    },
  },
  add: {
    bullet: [
      { block: "glow", delay: 0.07, life: 0.18, size: [1, 0.5], color: ["#ec8f98", "#d96973"] },
    ],
    laser: [
      {
        block: "beam",
        at: "origin",
        life: 0.18,
        size: [0.12, 0.03],
        color: ["#a8d8ec", "#5a9fc2"],
        side: -0.3,
      },
    ],
  },
};

/** A low puff of soot at a toxic muzzle. */
const SOOT_PUFF: Emitter = {
  block: "smoke",
  at: "origin",
  life: [0.4, 0.6],
  size: [0.3, 0.8],
  color: ["#3a3632", "#2a2826"],
  opacity: [0.65, 0],
  speed: 0.5,
  aim: "up",
  spin: [-1, 1],
};

/** Dirt and soot thrown up where a toxic shot hits, `delay` seconds after it fires. */
const dirt = (delay: number): Emitter => ({
  block: "smoke",
  delay,
  count: 3,
  life: [0.3, 0.5],
  size: [0.4, 1],
  color: ["#5c5145", "#2a2826"],
  opacity: [0.8, 0],
  speed: 0.8,
  aim: "up",
  spread: 0.8,
  spin: [-1, 1],
});

/** Furnace orange fire, heavy soot, rust, and marks that stay. */
const TOXIC: Style = {
  blocks: {
    flare: (emitter) => ({
      color: ["#f0a050", "#e8873a"],
      size: [scaled(emitter.size[0], 1.2), emitter.size[1]],
    }),
    // Additive parts stack, so they start darker than the orange they add up to.
    glow: () => ({ color: ["#c8702c", "#8a3a12"] }),
    // Dull orange, but bright enough that opponents see who is firing.
    tracer: () => ({ color: ["#d8843c", "#a05a24"] }),
    beam: () => ({ color: ["#c8702c", "#8a3a12"] }),
    arc: () => ({ color: ["#ffd8a8", "#e8873a"] }),
    spark: () => ({ color: ["#e0904a", "#9a4a18"] }),
    light: () => ({ color: ["#e8873a", "#8a3f12"] }),
    ring: () => ({ color: ["#5c5145", "#3d3a36"] }),
    fireball: () => ({ color: ["#e8873a", "#2a2826"] }),
    debris: () => ({ color: ["#6b4a33", "#4d4740"] }),
    smoke: (emitter) => ({
      color: ["#3a3632", "#2a2826"],
      opacity: [0.6, 0],
      life: scaled(emitter.life, 1.4),
      // The fire rolls into smoke as it burns.
      delay: emitter.delay === undefined ? undefined : scaled(emitter.delay, 0.4),
    }),
    scorch: (emitter) => ({ life: scaled(emitter.life, 1.5), opacity: [0.7, 0] }),
  },
  add: {
    bullet: [SOOT_PUFF, dirt(0.07)],
    lightning: [SOOT_PUFF, dirt(0)],
    missile: [SOOT_PUFF, dirt(0.2)],
    flame: [
      // The jet rolls into soot where it lands.
      {
        block: "smoke",
        count: [2, 3],
        delay: [0.12, 0.22],
        life: [0.6, 0.9],
        size: [0.4, 1.2],
        color: ["#3a3632", "#2a2826"],
        opacity: [0.55, 0],
        speed: 0.6,
        aim: "up",
        spread: 0.6,
        rise: 0.6,
        spin: [-1, 1],
      },
    ],
  },
};

const STYLES: Readonly<Record<string, Style>> = {
  "advanced-utopian": UTOPIAN,
  "cyber-samurai": SAMURAI,
  "toxic-industrial": TOXIC,
};

/**
 * Every faction's version of every kind of shot and death, named
 * `<faction>/<kind>`. The renderer plays the owner's faction's version, so two
 * factions firing the same kind of weapon look like themselves.
 */
export const FACTION_RECIPES: Readonly<Record<string, Recipe>> = Object.fromEntries(
  Object.entries(STYLES).flatMap(([faction, style]) =>
    KINDS.map((kind) => [`${faction}/${kind}`, restyle(kind, style)]),
  ),
);
