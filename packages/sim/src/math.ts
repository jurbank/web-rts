/**
 * Trigonometry built from exactly specified operations, so results are the
 * same bits on every engine (S4). Accurate to about 1e-10.
 */

export const PI = 3.141592653589793;
const TAU = PI * 2;
const HALF_PI = PI / 2;
const SQRT_3 = Math.sqrt(3);
const TAN_PI_12 = 2 - SQRT_3;

export function sin(angle: number): number {
  let x = angle - TAU * Math.floor((angle + PI) / TAU);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 3; n <= 17; n += 2) {
    term = (-term * x2) / (n * (n - 1));
    sum += term;
  }
  return sum;
}

export function cos(angle: number): number {
  return sin(angle + HALF_PI);
}

function atan(value: number): number {
  let z = Math.abs(value);
  const inverted = z > 1;
  if (inverted) z = 1 / z;
  const shifted = z > TAN_PI_12;
  if (shifted) z = (z * SQRT_3 - 1) / (SQRT_3 + z);
  const z2 = z * z;
  let power = z;
  let sum = z;
  for (let n = 3; n <= 19; n += 2) {
    power = -power * z2;
    sum += power / n;
  }
  if (shifted) sum += PI / 6;
  if (inverted) sum = HALF_PI - sum;
  return value < 0 ? -sum : sum;
}

export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}
