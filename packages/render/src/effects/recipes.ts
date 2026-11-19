import type { Shape } from "./blocks.ts";

/** A number, or a range a seeded draw picks from. */
export type Range = number | readonly [number, number];

/**
 * What an emitter draws.
 * - `glow`, `flare`: camera-facing light.
 * - `light`, `ring`: light lying on the ground.
 * - `smoke`: a camera-facing puff that covers what is behind it.
 * - `scorch`: a dark mark on the ground.
 * - `beam`: a ribbon from the origin to the target, such as a laser.
 * - `tracer`: a short ribbon that flies from the origin to the target.
 * - `spark`: a short ribbon stretched along its own flight.
 * - `fireball`: a lumpy sphere that burns away.
 * - `debris`: a lit chunk that falls and bounces.
 */
export type Block =
  | "glow"
  | "flare"
  | "light"
  | "ring"
  | "smoke"
  | "scorch"
  | "beam"
  | "tracer"
  | "spark"
  | "fireball"
  | "debris";

/** Which way an emitter throws what it makes. */
export type Aim = "forward" | "back" | "up" | "out";

/**
 * One part of an effect. Sizes and speeds are ground units before the recipe's
 * scale, durations are seconds, and every range is drawn per particle.
 */
export interface Emitter {
  readonly block: Block;
  /** Where it starts: the origin, such as a muzzle, or the target, such as an impact. Defaults to the target. */
  readonly at?: "origin" | "target";
  readonly count?: Range;
  readonly delay?: Range;
  readonly life: Range;
  /** Size at birth and at death: a diameter, a beam's width, a tracer's or spark's length, a fireball's radius. */
  readonly size: readonly [Range, Range];
  /** Color at birth and at death. A fireball's are its hot and cool colors. */
  readonly color: readonly [string, string];
  /** Opacity at birth and at death. Defaults to fading from 1 to 0. */
  readonly opacity?: readonly [number, number];
  readonly speed?: Range;
  /** Defaults to out. */
  readonly aim?: Aim;
  /** Half-angle in radians of the cone around `aim`. Out ignores it. */
  readonly spread?: number;
  /** Upward acceleration: positive for rising smoke, negative for falling debris. */
  readonly rise?: Range;
  /** The share of its speed it loses each second. */
  readonly drag?: number;
  /** How far from the anchor it may start. */
  readonly scatter?: Range;
  /** Height above the anchor. */
  readonly lift?: Range;
  /**
   * Distance to the right of the shot's line, negative for the left. A beam or
   * tracer moves only its start, so two beams can leave twin barrels and meet.
   */
  readonly side?: Range;
  /** Flies to the target over its life, whatever the distance, as a flame jet does. Overrides `speed`. */
  readonly arrive?: boolean;
  /** A chunk's length over its width, so debris can be shards. Defaults to 1. */
  readonly stretch?: number;
  /** Turns a second. */
  readonly spin?: Range;
}

export interface Recipe {
  readonly emitters: readonly Emitter[];
  /** The footprint radius the recipe is sized for. A death scales by the dead entity's radius over it. */
  readonly radius?: number;
}

export const BLOCK_SHAPES: Partial<Record<Block, Shape>> = {
  glow: "glow",
  flare: "flare",
  light: "glow",
  ring: "ring",
  smoke: "puff",
  scorch: "scorch",
};

const FLASH = "#fff4d6";
const FIRE = "#ff9a3c";
const EMBER = "#ff6a1f";
const SOOT = "#2b2622";
const DUST = "#8a8172";

/**
 * The effects every faction can draw. A shot kind names how a weapon fires,
 * and a death kind how something dies. Factions add their own versions of
 * these names.
 */
export const RECIPES = {
  bullet: {
    emitters: [
      { block: "flare", at: "origin", life: 0.06, size: [0.5, 0.35], color: [FLASH, FIRE] },
      { block: "glow", at: "origin", life: 0.1, size: [0.8, 0.4], color: [FIRE, EMBER] },
      {
        block: "tracer",
        at: "origin",
        life: 0.08,
        size: [0.7, 0.7],
        color: [FLASH, FIRE],
        opacity: [1, 0.8],
      },
      // The hit, big enough to read on a phone.
      { block: "flare", delay: 0.07, life: 0.1, size: [0.7, 0.4], color: [FLASH, FIRE] },
      {
        block: "spark",
        delay: 0.08,
        count: [3, 4],
        life: [0.12, 0.22],
        size: [0.35, 0.08],
        color: [FLASH, EMBER],
        speed: [3, 6],
        aim: "back",
        spread: 1.1,
        rise: -8,
      },
      {
        block: "smoke",
        delay: 0.08,
        life: [0.3, 0.5],
        size: [0.25, 0.6],
        color: [DUST, DUST],
        opacity: [0.45, 0],
        speed: 0.4,
        aim: "up",
        spin: [-1, 1],
      },
    ],
  },
  laser: {
    emitters: [
      {
        block: "beam",
        at: "origin",
        life: 0.18,
        size: [0.22, 0.04],
        color: ["#bfefff", "#4fb6ff"],
      },
      { block: "glow", at: "origin", life: 0.18, size: [0.7, 0.3], color: ["#dff6ff", "#4fb6ff"] },
      { block: "glow", life: 0.22, size: [0.9, 0.3], color: ["#ffffff", "#4fb6ff"] },
      {
        block: "light",
        life: 0.3,
        size: [1.4, 0.8],
        color: ["#4fb6ff", "#1a4f8f"],
        opacity: [0.6, 0],
      },
      {
        block: "spark",
        count: [3, 5],
        life: [0.12, 0.25],
        size: [0.3, 0.05],
        color: ["#ffffff", "#4fb6ff"],
        speed: [3, 7],
        aim: "back",
        spread: 1.3,
        rise: -6,
      },
    ],
  },
  flame: {
    emitters: [
      { block: "glow", at: "origin", life: 0.12, size: [0.7, 0.5], color: ["#ffe2a0", FIRE] },
      {
        block: "glow",
        at: "origin",
        count: [9, 10],
        delay: [0, 0.1],
        life: [0.2, 0.26],
        size: [0.5, 1.2],
        color: ["#e07a30", "#a03a10"],
        arrive: true,
        aim: "forward",
        spread: 0.08,
      },
      { block: "light", life: 0.35, size: [1.6, 1], color: [FIRE, EMBER], opacity: [0.6, 0] },
      {
        block: "smoke",
        delay: 0.15,
        count: 1,
        life: [0.5, 0.8],
        size: [0.4, 1],
        color: ["#3d3833", SOOT],
        opacity: [0.45, 0],
        speed: 0.6,
        aim: "up",
        spread: 0.5,
        spin: [-1, 1],
      },
    ],
  },
  melee: {
    emitters: [
      { block: "flare", life: 0.08, size: [0.6, 0.3], color: [FLASH, FIRE] },
      {
        block: "spark",
        count: [4, 6],
        life: [0.1, 0.2],
        size: [0.25, 0.05],
        color: [FLASH, EMBER],
        speed: [3, 6],
        aim: "out",
        rise: -8,
      },
    ],
  },
  "unit-death": {
    radius: 0.4,
    emitters: [
      { block: "flare", life: 0.1, size: [0.8, 0.5], color: [FLASH, FIRE], lift: 0.3 },
      {
        block: "spark",
        count: [5, 8],
        life: [0.15, 0.3],
        size: [0.3, 0.05],
        color: [FLASH, EMBER],
        speed: [3, 6],
        aim: "out",
        rise: -9,
        lift: 0.3,
      },
      {
        block: "smoke",
        count: 2,
        life: [0.6, 0.9],
        size: [0.4, 1],
        color: [DUST, DUST],
        opacity: [0.5, 0],
        speed: 0.5,
        aim: "up",
        scatter: 0.2,
        lift: 0.2,
        spin: [-1, 1],
      },
    ],
  },
  "vehicle-death": {
    radius: 1,
    emitters: [
      { block: "flare", life: 0.12, size: [3, 1.5], color: [FLASH, FIRE], lift: 0.6 },
      { block: "light", life: 0.5, size: [4, 2.5], color: [FIRE, EMBER], opacity: [0.8, 0] },
      {
        block: "fireball",
        count: [2, 3],
        delay: [0, 0.12],
        life: [0.7, 1],
        size: [0.5, 1.1],
        color: [FIRE, SOOT],
        speed: [0.3, 0.8],
        aim: "up",
        spread: 0.9,
        scatter: 0.4,
        lift: 0.5,
      },
      { block: "ring", life: 0.4, size: [0.8, 4], color: [FIRE, EMBER], opacity: [0.9, 0] },
      {
        block: "debris",
        count: [6, 9],
        life: [1.6, 2.2],
        size: [0.18, 0.12],
        color: ["#3a3632", "#2a2725"],
        speed: [3, 6],
        aim: "up",
        spread: 1.1,
        rise: -14,
        lift: 0.5,
        spin: [-8, 8],
      },
      {
        block: "spark",
        count: [8, 12],
        life: [0.2, 0.45],
        size: [0.5, 0.08],
        color: [FLASH, EMBER],
        speed: [5, 9],
        aim: "out",
        rise: -10,
        lift: 0.5,
      },
      {
        block: "smoke",
        count: [4, 5],
        delay: [0.2, 0.5],
        life: [1.4, 2],
        size: [0.8, 2.2],
        color: ["#3d3833", SOOT],
        opacity: [0.55, 0],
        speed: [0.4, 0.8],
        aim: "up",
        spread: 0.5,
        scatter: 0.5,
        lift: 0.8,
        rise: 0.3,
        drag: 0.6,
        spin: [-0.6, 0.6],
      },
      {
        block: "scorch",
        life: 6,
        size: [2.6, 2.6],
        color: ["#1b1916", "#1b1916"],
        opacity: [0.55, 0],
        spin: 0,
      },
    ],
  },
  "building-death": {
    radius: 2.5,
    emitters: [
      {
        block: "flare",
        life: 0.16,
        size: [8, 4],
        color: [FLASH, FIRE],
        opacity: [0.85, 0],
        lift: 1.2,
      },
      { block: "light", life: 0.9, size: [12, 8], color: [FIRE, EMBER], opacity: [0.8, 0] },
      // Fireballs across the whole footprint, wider than the building.
      {
        block: "fireball",
        count: [7, 9],
        delay: [0, 0.9],
        life: [0.9, 1.3],
        size: [1.3, 2.6],
        color: [FIRE, SOOT],
        speed: [0.3, 1],
        aim: "up",
        spread: 1,
        scatter: 2.6,
        lift: [0.6, 1.6],
      },
      { block: "ring", life: 0.7, size: [3, 13], color: [DUST, DUST], opacity: [0.7, 0] },
      {
        block: "debris",
        count: [12, 16],
        life: [1.6, 2.4],
        size: [0.3, 0.2],
        color: ["#4a4540", "#2a2725"],
        speed: [4, 8],
        aim: "up",
        spread: 1.1,
        rise: -14,
        scatter: 1,
        lift: 1,
        spin: [-6, 6],
      },
      {
        block: "smoke",
        count: [8, 10],
        delay: [0.2, 1.2],
        life: [2, 3],
        size: [1.5, 4],
        color: ["#4a443d", SOOT],
        opacity: [0.4, 0],
        speed: [0.4, 0.9],
        aim: "up",
        spread: 0.5,
        scatter: 1.8,
        lift: 1,
        rise: 0.3,
        drag: 0.6,
        spin: [-0.4, 0.4],
      },
      {
        block: "scorch",
        life: 10,
        size: [6, 6],
        color: ["#1b1916", "#1b1916"],
        opacity: [0.6, 0],
      },
    ],
  },
} as const satisfies Record<string, Recipe>;

export type RecipeName = keyof typeof RECIPES;

export const SHOT_KINDS = [
  "bullet",
  "laser",
  "flame",
  "melee",
] as const satisfies readonly RecipeName[];
export const DEATH_KINDS = [
  "unit-death",
  "vehicle-death",
  "building-death",
] as const satisfies readonly RecipeName[];
