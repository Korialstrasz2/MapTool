import seedrandom from 'seedrandom';
import type { GeneratorResult } from '$lib/types/generation';

export type Rng = seedrandom.PRNG;

export function createRng(seed: number, salt = ''): Rng {
  return seedrandom(`${seed}-${salt}`, { state: true });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hashCoords(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177);
  n = (n ^ (n >> 13)) >>> 0;
  n = Math.imul(n, 1274126177);
  n = (n ^ (n >> 16)) >>> 0;
  return n / 0xffffffff;
}

export function valueNoise(x: number, y: number, frequency: number, seed: number): number {
  const xf = x * frequency;
  const yf = y * frequency;
  const x0 = Math.floor(xf);
  const y0 = Math.floor(yf);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = xf - x0;
  const sy = yf - y0;

  const n00 = hashCoords(x0, y0, seed);
  const n10 = hashCoords(x1, y0, seed);
  const n01 = hashCoords(x0, y1, seed);
  const n11 = hashCoords(x1, y1, seed);

  const ix0 = lerp(n00, n10, smoothStep(sx));
  const ix1 = lerp(n01, n11, smoothStep(sx));
  return lerp(ix0, ix1, smoothStep(sy));
}

export function fractalNoise(
  x: number,
  y: number,
  octaves: number,
  baseFrequency: number,
  persistence: number,
  seed: number
): number {
  let amplitude = 1;
  let frequency = baseFrequency;
  let total = 0;
  let maxValue = 0;

  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(x, y, frequency, seed + i * 97) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return maxValue === 0 ? 0 : total / maxValue;
}

export function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function normalizeArray(data: Float32Array | number[]): Float32Array {
  const values = data instanceof Float32Array ? data : Float32Array.from(data);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;
  const normalized = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    normalized[i] = (values[i] - min) / range;
  }
  return normalized;
}

export function blurField(
  field: Float32Array,
  width: number,
  height: number,
  iterations: number,
  kernelSize = 1
): void {
  const temp = new Float32Array(field.length);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    temp.set(field);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = 0;
        let count = 0;
        for (let dy = -kernelSize; dy <= kernelSize; dy += 1) {
          for (let dx = -kernelSize; dx <= kernelSize; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            total += temp[ny * width + nx];
            count += 1;
          }
        }
        field[y * width + x] = total / (count || 1);
      }
    }
  }
}

export function upscaleBilinear(
  source: Float32Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number
): Float32Array {
  const output = new Float32Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = (y / (targetHeight - 1)) * (height - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(height - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = (x / (targetWidth - 1)) * (width - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(width - 1, x0 + 1);
      const tx = sx - x0;
      const idx00 = y0 * width + x0;
      const idx10 = y0 * width + x1;
      const idx01 = y1 * width + x0;
      const idx11 = y1 * width + x1;
      const v0 = lerp(source[idx00], source[idx10], smoothStep(tx));
      const v1 = lerp(source[idx01], source[idx11], smoothStep(tx));
      output[y * targetWidth + x] = lerp(v0, v1, smoothStep(ty));
    }
  }
  return output;
}

export function computeFlowAndWater(
  heightmap: Float32Array,
  width: number,
  height: number,
  seaLevel: number
): { flow: Float32Array; water: Float32Array } {
  const flow = new Float32Array(width * height);
  const water = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const h = heightmap[index];
      let slope = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighborIndex = ny * width + nx;
          const diff = h - heightmap[neighborIndex];
          if (diff > 0) {
            slope += diff;
          }
          count += 1;
        }
      }
      const normalizedSlope = count === 0 ? 0 : slope / count;
      flow[index] = normalizedSlope;
      if (h < seaLevel) {
        water[index] = clamp((seaLevel - h) * 2.5, 0, 1);
      } else {
        water[index] = clamp(normalizedSlope * 1.2, 0, 1);
      }
    }
  }

  return { flow: normalizeArray(flow), water: normalizeArray(water) };
}

export function computeTemperature(
  heightmap: Float32Array,
  width: number,
  height: number,
  seaLevel: number
): Float32Array {
  const temperature = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const latitude = y / (height - 1);
    const latFactor = 1 - Math.abs(latitude - 0.5) * 2;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const elevation = heightmap[index];
      const altitudePenalty = elevation > seaLevel ? (elevation - seaLevel) * 1.6 : 0;
      const value = clamp(latFactor - altitudePenalty, 0, 1);
      temperature[index] = value;
    }
  }
  return temperature;
}

export function computeBiomeIndex(
  heightmap: Float32Array,
  water: Float32Array,
  temperature: Float32Array,
  moisture: Float32Array,
  seaLevel: number
): Uint8Array {
  const biome = new Uint8Array(heightmap.length);
  for (let i = 0; i < heightmap.length; i += 1) {
    const h = heightmap[i];
    const w = water[i];
    const t = temperature[i];
    const m = moisture[i];

    if (h < seaLevel * 0.92) {
      biome[i] = 0; // ocean
      continue;
    }
    if (w > 0.68) {
      biome[i] = 1; // lake/wetland
      continue;
    }
    if (h > 0.82 && t < 0.55) {
      biome[i] = 9; // alpine
      continue;
    }
    if (t < 0.22) {
      biome[i] = 2; // tundra
      continue;
    }
    if (t < 0.38) {
      biome[i] = m > 0.55 ? 3 : 2; // boreal or tundra
      continue;
    }
    if (t < 0.64) {
      if (m > 0.65) {
        biome[i] = 4; // temperate forest
      } else if (m > 0.35) {
        biome[i] = 5; // temperate grassland
      } else {
        biome[i] = 8; // desert
      }
      continue;
    }
    if (m > 0.72) {
      biome[i] = 6; // tropical forest
    } else if (m > 0.45) {
      biome[i] = 7; // savanna
    } else {
      biome[i] = 8; // desert
    }
  }
  return biome;
}

export function finalizeResult(
  width: number,
  height: number,
  heightmap: Float32Array,
  moisture: Float32Array,
  seaLevel: number
): GeneratorResult {
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < heightmap.length; i += 1) {
    const value = heightmap[i];
    if (value < minHeight) minHeight = value;
    if (value > maxHeight) maxHeight = value;
  }
  const heightRange = maxHeight - minHeight || 1;
  const normalizedHeight = new Float32Array(heightmap.length);
  for (let i = 0; i < heightmap.length; i += 1) {
    normalizedHeight[i] = (heightmap[i] - minHeight) / heightRange;
  }

  let minMoisture = Number.POSITIVE_INFINITY;
  let maxMoisture = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < moisture.length; i += 1) {
    const value = moisture[i];
    if (value < minMoisture) minMoisture = value;
    if (value > maxMoisture) maxMoisture = value;
  }
  const moistureRange = maxMoisture - minMoisture || 1;
  const normalizedMoisture = new Float32Array(moisture.length);
  for (let i = 0; i < moisture.length; i += 1) {
    normalizedMoisture[i] = (moisture[i] - minMoisture) / moistureRange;
  }

  const normalizedSeaLevel = clamp((seaLevel - minHeight) / heightRange, 0, 1);

  const { flow, water } = computeFlowAndWater(normalizedHeight, width, height, normalizedSeaLevel);
  const temperature = computeTemperature(normalizedHeight, width, height, normalizedSeaLevel);
  const biome = computeBiomeIndex(
    normalizedHeight,
    water,
    temperature,
    normalizedMoisture,
    normalizedSeaLevel
  );

  return {
    width,
    height,
    heightmap: normalizedHeight,
    flow,
    moisture: normalizedMoisture,
    temperature,
    biome,
    water
  };
}
