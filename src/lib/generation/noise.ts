export interface FbmOptions {
  octaves?: number;
  lacunarity?: number;
  gain?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 69069;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 0xffffffff;
}

export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const topLeft = hash(xi, yi, seed);
  const topRight = hash(xi + 1, yi, seed);
  const bottomLeft = hash(xi, yi + 1, seed);
  const bottomRight = hash(xi + 1, yi + 1, seed);

  const u = fade(xf);
  const v = fade(yf);

  const top = lerp(topLeft, topRight, u);
  const bottom = lerp(bottomLeft, bottomRight, u);
  return lerp(top, bottom, v);
}

export function fbm2D(x: number, y: number, seed: number, options: FbmOptions = {}): number {
  const octaves = options.octaves ?? 5;
  const lacunarity = options.lacunarity ?? 2.1;
  const gain = options.gain ?? 0.5;

  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let amplitudeSum = 0;

  for (let i = 0; i < octaves; i += 1) {
    const noise = valueNoise2D(x * frequency, y * frequency, seed + i) * 2 - 1;
    sum += noise * amplitude;
    amplitudeSum += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  if (amplitudeSum === 0) {
    return 0;
  }

  return sum / amplitudeSum;
}

export function ridgedFbm2D(
  x: number,
  y: number,
  seed: number,
  options: FbmOptions = {}
): number {
  const octaves = options.octaves ?? 5;
  const lacunarity = options.lacunarity ?? 2.0;
  const gain = options.gain ?? 0.6;

  let amplitude = 0.5;
  let frequency = 1.5;
  let sum = 0;
  let amplitudeSum = 0;

  for (let i = 0; i < octaves; i += 1) {
    const noise = valueNoise2D(x * frequency, y * frequency, seed + i) * 2 - 1;
    const ridge = 1 - Math.abs(noise);
    const contribution = ridge * ridge;
    sum += contribution * amplitude;
    amplitudeSum += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  if (amplitudeSum === 0) {
    return 0;
  }

  return clamp(sum / amplitudeSum, 0, 1);
}

export function domainWarp(
  x: number,
  y: number,
  seed: number,
  strength: number,
  scale: number
): { x: number; y: number } {
  if (strength <= 0) {
    return { x, y };
  }

  const warpScale = scale * 1.3;
  const dx = valueNoise2D(x * warpScale + 19.7, y * warpScale + 43.3, seed + 101) * 2 - 1;
  const dy = valueNoise2D(x * warpScale + 73.1, y * warpScale + 11.8, seed + 203) * 2 - 1;

  return {
    x: x + dx * strength,
    y: y + dy * strength
  };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
