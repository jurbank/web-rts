/** Xorshift32. The state is one non-zero unsigned 32-bit integer. */

/** Small seeds start Xorshift on small values, so a few steps mix them before the first draw. */
export function seedRandom(seed: number): number {
  let state = seed >>> 0 || 0x9e3779b9;
  for (let i = 0; i < 4; i++) state = nextRandomState(state);
  return state;
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
