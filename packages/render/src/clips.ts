/** A clip baked into rows of vertex frames, as a creature's GLB describes it. */
export interface BakedClip {
  readonly start: number;
  readonly frames: number;
  readonly loop: boolean;
  /** The ground one `move` cycle covers. */
  readonly stride?: number;
}

/** The two baked rows around `seconds` into a clip, and how far it is from the first to the second. */
export function sampleClip(
  clip: BakedClip,
  rate: number,
  seconds: number,
): [number, number, number] {
  const at = Math.max(0, seconds * rate);
  const whole = Math.floor(at);
  if (clip.loop) {
    const row = whole % clip.frames;
    return [clip.start + row, clip.start + ((row + 1) % clip.frames), at - whole];
  }
  const last = clip.start + clip.frames - 1;
  if (whole >= clip.frames - 1) return [last, last, 0];
  return [clip.start + whole, clip.start + whole + 1, at - whole];
}

export const clipSeconds = (clip: BakedClip, rate: number): number => clip.frames / rate;
