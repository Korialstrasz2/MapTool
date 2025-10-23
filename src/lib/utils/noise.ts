const UINT32_MAX = 0xffffffff;

function hash(value: number): number {
  value = (value + 0x7ed55d16) + (value << 12);
  value = (value ^ 0xc761c23c) ^ (value >>> 19);
  value = (value + 0x165667b1) + (value << 5);
  value = (value + 0xd3a2646c) ^ (value << 9);
  value = (value + 0xfd7046c5) + (value << 3);
  value = (value ^ 0xb55a4f09) ^ (value >>> 16);
  return value >>> 0;
}

function hash2d(x: number, y: number, seed: number): number {
  const hx = hash(x | 0);
  const hy = hash((y << 16) ^ y);
  const hs = hash(seed);
  return hash(hx ^ hy ^ hs);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise2D(x: number, y: number, scale: number, seed: number): number {
  const sx = x / scale;
  const sy = y / scale;

  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const tx = smoothstep(sx - x0);
  const ty = smoothstep(sy - y0);

  const v00 = hash2d(x0, y0, seed) / UINT32_MAX;
  const v10 = hash2d(x1, y0, seed) / UINT32_MAX;
  const v01 = hash2d(x0, y1, seed) / UINT32_MAX;
  const v11 = hash2d(x1, y1, seed) / UINT32_MAX;

  const ix0 = lerp(v00, v10, tx);
  const ix1 = lerp(v01, v11, tx);

  return lerp(ix0, ix1, ty);
}

export interface FbmOptions {
  octaves: number;
  lacunarity: number;
  gain: number;
  scale: number;
  seed: number;
}

export function fbmNoise2D(x: number, y: number, options: FbmOptions): number {
  let amplitude = 1;
  let frequency = 1;
  let value = 0;
  let totalAmplitude = 0;

  for (let octave = 0; octave < options.octaves; octave += 1) {
    const sampleX = x * frequency;
    const sampleY = y * frequency;
    const noise = valueNoise2D(sampleX, sampleY, options.scale, options.seed + octave * 101);
    value += (noise * 2 - 1) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= options.gain;
    frequency *= options.lacunarity;
  }

  if (totalAmplitude <= 0) {
    return 0;
  }

  return value / totalAmplitude;
}

export function ridgedNoise2D(x: number, y: number, options: FbmOptions): number {
  const base = fbmNoise2D(x, y, options);
  return 1 - Math.abs(base);
}

export function warpCoordinates(
  x: number,
  y: number,
  seed: number,
  strength: number,
  scale: number
): [number, number] {
  if (strength === 0) {
    return [x, y];
  }
  const dx = fbmNoise2D(x + seed * 1.37, y - seed * 0.91, {
    octaves: 3,
    lacunarity: 2.1,
    gain: 0.5,
    scale,
    seed: seed ^ 0xdeadbeef
  });
  const dy = fbmNoise2D(x - seed * 0.73, y + seed * 1.21, {
    octaves: 3,
    lacunarity: 2.05,
    gain: 0.55,
    scale,
    seed: seed ^ 0xbaadf00d
  });
  return [x + dx * strength, y + dy * strength];
}
