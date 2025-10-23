import type { GeneratorParameters, GeneratorResult } from '$lib/types/generation';
import {
  blurField,
  clamp,
  createRng,
  finalizeResult,
  fractalNoise,
  smoothStep,
  valueNoise
} from './common';

interface Basin {
  x: number;
  y: number;
  radius: number;
  depth: number;
}

function nextPowerOfTwoPlusOne(value: number): number {
  const exponent = Math.ceil(Math.log2(value - 1));
  return 2 ** exponent + 1;
}

function generateDiamondSquare(size: number, roughness: number, rng: () => number): Float32Array {
  const grid = new Float32Array(size * size);
  const last = size - 1;
  grid[0] = rng();
  grid[last] = rng();
  grid[last * size] = rng();
  grid[last * size + last] = rng();

  let step = last;
  let scale = roughness;

  while (step > 1) {
    const half = step / 2;

    for (let y = half; y < size; y += step) {
      for (let x = half; x < size; x += step) {
        const idx = y * size + x;
        const a = grid[(y - half) * size + (x - half)];
        const b = grid[(y - half) * size + (x + half)];
        const c = grid[(y + half) * size + (x - half)];
        const d = grid[(y + half) * size + (x + half)];
        const average = (a + b + c + d) / 4;
        grid[idx] = average + (rng() * 2 - 1) * scale;
      }
    }

    for (let y = 0; y < size; y += half) {
      for (let x = (y + half) % step; x < size; x += step) {
        let total = 0;
        let count = 0;
        if (x - half >= 0) {
          total += grid[y * size + (x - half)];
          count += 1;
        }
        if (x + half < size) {
          total += grid[y * size + (x + half)];
          count += 1;
        }
        if (y - half >= 0) {
          total += grid[(y - half) * size + x];
          count += 1;
        }
        if (y + half < size) {
          total += grid[(y + half) * size + x];
          count += 1;
        }
        const index = y * size + x;
        const average = total / (count || 1);
        grid[index] = average + (rng() * 2 - 1) * scale;
      }
    }

    step = half;
    scale *= roughness;
  }

  return grid;
}

function normalizeGrid(grid: Float32Array): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < grid.length; i += 1) {
    const v = grid[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < grid.length; i += 1) {
    grid[i] = (grid[i] - min) / range;
  }
}

export function runFractalBasinsGenerator(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed, values } = params;
  const seaLevel = values.seaLevel ?? 0.5;
  const roughness = clamp(values.roughness ?? 0.75, 0.2, 1.6);
  const basinStrength = clamp(values.basinStrength ?? 0.25, 0, 1);
  const riverDensity = clamp(values.riverDensity ?? 0.6, 0.05, 1.2);
  const moistureRamp = clamp(values.moistureRamp ?? 1, 0.2, 2.2);

  const rng = createRng(seed, 'fractal');
  const gridSize = nextPowerOfTwoPlusOne(Math.max(width, height));
  const fractalGrid = generateDiamondSquare(gridSize, roughness, rng);
  normalizeGrid(fractalGrid);

  const basinCount = 3;
  const basins: Basin[] = Array.from({ length: basinCount }, () => ({
    x: clamp(rng(), 0.1, 0.9),
    y: clamp(rng(), 0.1, 0.9),
    radius: 0.18 + rng() * 0.35,
    depth: 0.35 + rng() * 0.45
  }));

  const heightField = new Float32Array(width * height);
  const moistureField = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const ny = y / (height - 1);
    const gy = ny * (gridSize - 1);
    const gy0 = Math.floor(gy);
    const gy1 = Math.min(gridSize - 1, gy0 + 1);
    const ty = smoothStep(gy - gy0);
    for (let x = 0; x < width; x += 1) {
      const nx = x / (width - 1);
      const gx = nx * (gridSize - 1);
      const gx0 = Math.floor(gx);
      const gx1 = Math.min(gridSize - 1, gx0 + 1);
      const tx = smoothStep(gx - gx0);
      const idx00 = gy0 * gridSize + gx0;
      const idx10 = gy0 * gridSize + gx1;
      const idx01 = gy1 * gridSize + gx0;
      const idx11 = gy1 * gridSize + gx1;
      const top = fractalGrid[idx00] * (1 - tx) + fractalGrid[idx10] * tx;
      const bottom = fractalGrid[idx01] * (1 - tx) + fractalGrid[idx11] * tx;
      let value = top * (1 - ty) + bottom * ty;

      let basinEffect = 0;
      for (const basin of basins) {
        const dx = nx - basin.x;
        const dy = ny - basin.y;
        const distance = Math.hypot(dx, dy) / basin.radius;
        const falloff = smoothStep(clamp(1 - distance, 0, 1));
        basinEffect += falloff * basin.depth;
      }
      basinEffect *= basinStrength;
      value = value * (1 - basinStrength) + (value - basinEffect) * basinStrength;

      const ridgeNoise = valueNoise(nx, ny, 8.5, seed + 701);
      const detailNoise = fractalNoise(nx, ny, 3, 5.2, 0.45, seed + 811);
      value += (ridgeNoise - 0.5) * 0.15;
      value += (detailNoise - 0.5) * 0.12;

      const edgeDistance = Math.min(nx, ny, 1 - nx, 1 - ny);
      value -= clamp(0.12 - edgeDistance, 0, 0.12) * 1.8;

      const moistureBase = (1 - value) * moistureRamp;
      const basinMoisture = basinEffect * 0.65;
      const rainfallNoise = fractalNoise(nx + 2.5, ny + 1.3, 4, 3.6, 0.55, seed + 977);
      const riverMask = Math.pow(clamp(1 - Math.abs(nx - 0.5) * 2, 0, 1), 1.5);
      const moistureValue =
        moistureBase +
        basinMoisture +
        (rainfallNoise - 0.5) * 0.4 +
        riverMask * riverDensity * 0.45;

      const index = y * width + x;
      heightField[index] = value;
      moistureField[index] = moistureValue;
    }
  }

  blurField(heightField, width, height, 1, 1);
  blurField(moistureField, width, height, 1, 1);

  return finalizeResult(width, height, heightField, moistureField, seaLevel);
}
