/** Xorshift32. The state is one non-zero unsigned 32-bit integer. */

export function seedRandom(seed: number): number {
  return seed >>> 0 || 0x9e3779b9;
}

export function nextRandomState(state: number): number {
  let x = state;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

/** Maps a state to a number in [0, 1). */
export function randomUnit(state: number): number {
  return state / 0x100000000;
}
