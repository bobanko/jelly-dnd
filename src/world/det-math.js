// Bit-reproducible replacements for the Math functions whose last digits the language leaves
// to each engine (hypot, exp, sin, cos, atan2). Network play runs the same simulation on
// every machine, so the world may only use arithmetic that IEEE 754 defines exactly:
// + - * / and Math.sqrt. Accurate to about 1e-15, which the game cannot tell apart.
const LN2_HI = 0.6931471803691238,
  LN2_LO = 1.9082149292705877e-10,
  PIO2_HI = 1.5707963267341256,
  PIO2_LO = 6.077100506506192e-11,
  SQRT3 = 1.7320508075688772,
  PI = 3.141592653589793;

export function hypot(x, y, z = 0) {
  return Math.sqrt(x * x + y * y + z * z);
}

export function exp(x) {
  if (x !== x) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.2) return 0;
  const k = Math.round(x / 0.6931471805599453),
    r = x - k * LN2_HI - k * LN2_LO;
  let term = 1,
    sum = 1;
  for (let n = 1; n <= 14; n++) {
    term *= r / n;
    sum += term;
  }
  for (let i = 0; i < k; i++) sum *= 2;
  for (let i = 0; i > k; i--) sum *= 0.5;
  return sum;
}

// Sine and cosine of r in [-pi/4, pi/4] by Taylor series.
function sinCos(x) {
  const k = Math.round(x / 1.5707963267948966),
    r = x - k * PIO2_HI - k * PIO2_LO,
    r2 = r * r;
  let sinTerm = r,
    sin = r,
    cosTerm = 1,
    cos = 1;
  for (let n = 1; n <= 9; n++) {
    cosTerm *= -r2 / ((2 * n - 1) * (2 * n));
    cos += cosTerm;
    sinTerm *= -r2 / (2 * n * (2 * n + 1));
    sin += sinTerm;
  }
  const quarter = ((k % 4) + 4) % 4;
  return quarter === 0
    ? [sin, cos]
    : quarter === 1
      ? [cos, -sin]
      : quarter === 2
        ? [-sin, -cos]
        : [-cos, sin];
}
export function sin(x) {
  return Number.isFinite(x) ? sinCos(x)[0] : NaN;
}
export function cos(x) {
  return Number.isFinite(x) ? sinCos(x)[1] : NaN;
}

// Arctangent of t >= 0.
function atan(t) {
  if (t > 1) return PI / 2 - atan(1 / t);
  let offset = 0;
  if (t > 0.2679491924311227) {
    offset = PI / 6;
    t = (SQRT3 * t - 1) / (SQRT3 + t);
  }
  const t2 = t * t;
  let power = t,
    sum = t;
  for (let n = 1; n <= 15; n++) {
    power *= -t2;
    sum += power / (2 * n + 1);
  }
  return offset + sum;
}
export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (y === 0) return x < 0 || Object.is(x, -0) ? (Object.is(y, -0) ? -PI : PI) : y;
  if (x === 0) return y > 0 ? PI / 2 : -PI / 2;
  const angle = atan(Math.abs(y / x)),
    unsigned = x > 0 ? angle : PI - angle;
  return y > 0 ? unsigned : -unsigned;
}
