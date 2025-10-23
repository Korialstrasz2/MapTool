import type { GeneratorResult } from '$lib/types/generation';

const DIRECTIONS: Array<[number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
];

export interface TerrainComputationConfig {
  seaLevel: number;
  moistureScale: number;
}

export function buildFlowMap(
  heightmap: Float32Array,
  width: number,
  height: number,
  seaLevel: number
): { flow: Float32Array; water: Float32Array } {
  const downslope = new Array<number | null>(width * height).fill(null);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = heightmap[index];
      let lowest = current;
      let lowestIndex: number | null = null;

      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const neighborIndex = ny * width + nx;
        const neighbor = heightmap[neighborIndex];
        if (neighbor < lowest) {
          lowest = neighbor;
          lowestIndex = neighborIndex;
        }
      }

      downslope[index] = lowestIndex;
    }
  }

  const order = new Array<number>(width * height)
    .fill(0)
    .map((_, index) => index)
    .sort((a, b) => heightmap[b] - heightmap[a]);

  const flow = new Float32Array(width * height).fill(1);
  for (const cell of order) {
    const target = downslope[cell];
    if (target != null) {
      flow[target] += flow[cell];
    }
  }

  const maxFlow = flow.reduce((acc, value) => Math.max(acc, value), 0);
  const water = new Float32Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const elevation = heightmap[index];
    if (elevation <= seaLevel) {
      water[index] = 1;
      continue;
    }
    const runoff = Math.pow(flow[index] / (maxFlow + 1), 0.4);
    if (runoff > 0.3) {
      water[index] = runoff;
    }
  }

  return { flow, water };
}

export function enhanceMoisture(
  moisture: Float32Array,
  water: Float32Array,
  flow: Float32Array,
  moistureScale: number
): void {
  const maxFlow = flow.reduce((acc, value) => Math.max(acc, value), 0);
  for (let index = 0; index < moisture.length; index += 1) {
    const waterBonus = Math.min(0.7, water[index] * 0.7);
    const flowBonus = Math.min(0.8, (flow[index] / (maxFlow + 1)) * 1.8);
    const value = (moisture[index] + waterBonus + flowBonus) / (1 + moistureScale * 0.5);
    moisture[index] = Math.min(1, Math.max(0, value));
  }
}

export function classifyBiomes(
  heightmap: Float32Array,
  water: Float32Array,
  temperature: Float32Array,
  moisture: Float32Array,
  width: number,
  height: number,
  seaLevel: number
): Uint8Array {
  const biomes = new Uint8Array(width * height);

  for (let index = 0; index < biomes.length; index += 1) {
    const elevation = heightmap[index];
    if (elevation <= seaLevel - 0.02) {
      biomes[index] = 0;
      continue;
    }
    if (water[index] > 0.6) {
      biomes[index] = 1;
      continue;
    }
    if (elevation > 0.82) {
      biomes[index] = 9;
      continue;
    }

    const temp = temperature[index];
    const moist = moisture[index];
    let biome = 8;

    if (temp < 0.2) {
      biome = 2;
    } else if (temp < 0.35) {
      biome = moist > 0.4 ? 3 : 2;
    } else if (temp < 0.55) {
      if (moist > 0.55) {
        biome = 4;
      } else if (moist > 0.35) {
        biome = 5;
      } else {
        biome = 8;
      }
    } else if (temp < 0.75) {
      if (moist > 0.65) {
        biome = 4;
      } else if (moist > 0.4) {
        biome = 5;
      } else {
        biome = 7;
      }
    } else if (moist > 0.7) {
      biome = 6;
    } else if (moist > 0.45) {
      biome = 7;
    }

    biomes[index] = biome;
  }

  return biomes;
}

export function computeTemperatureField(
  width: number,
  height: number,
  heightmap: Float32Array,
  seaLevel: number,
  lapseRate = 1.5
): Float32Array {
  const temperature = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const latitude = y / height - 0.5;
      const altitudePenalty = Math.min(1, Math.max(0, heightmap[index] - seaLevel) * lapseRate);
      const baseTemperature = Math.max(0, Math.min(1, 1 - Math.abs(latitude) * 1.8));
      temperature[index] = Math.max(0, Math.min(1, baseTemperature - altitudePenalty));
    }
  }
  return temperature;
}

export function finalizeTerrain(
  width: number,
  height: number,
  heightmap: Float32Array,
  baseMoisture: Float32Array,
  config: TerrainComputationConfig
): Omit<GeneratorResult, 'width' | 'height'> {
  const temperature = computeTemperatureField(width, height, heightmap, config.seaLevel);
  const { flow, water } = buildFlowMap(heightmap, width, height, config.seaLevel);
  const moisture = baseMoisture.slice();
  enhanceMoisture(moisture, water, flow, config.moistureScale);
  const biome = classifyBiomes(heightmap, water, temperature, moisture, width, height, config.seaLevel);

  return {
    heightmap,
    flow,
    moisture,
    temperature,
    biome,
    water
  };
}

export function normalizeHeightmap(heightmap: Float32Array): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < heightmap.length; i += 1) {
    const value = heightmap[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min || 1;
  for (let i = 0; i < heightmap.length; i += 1) {
    heightmap[i] = (heightmap[i] - min) / range;
  }
}

export function blurHeightmap(
  heightmap: Float32Array,
  width: number,
  height: number,
  passes: number
): void {
  const scratch = new Float32Array(heightmap.length);
  const kernel = [0.0625, 0.25, 0.375, 0.25, 0.0625];

  for (let pass = 0; pass < passes; pass += 1) {
    scratch.set(heightmap);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        for (let k = -2; k <= 2; k += 1) {
          const sampleX = Math.min(width - 1, Math.max(0, x + k));
          sum += scratch[y * width + sampleX] * kernel[k + 2];
        }
        heightmap[y * width + x] = sum;
      }
    }

    scratch.set(heightmap);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        for (let k = -2; k <= 2; k += 1) {
          const sampleY = Math.min(height - 1, Math.max(0, y + k));
          sum += scratch[sampleY * width + x] * kernel[k + 2];
        }
        heightmap[y * width + x] = sum;
      }
    }
  }
}

export function createEmptyResult(width: number, height: number): GeneratorResult {
  return {
    width,
    height,
    heightmap: new Float32Array(width * height),
    flow: new Float32Array(width * height),
    moisture: new Float32Array(width * height),
    temperature: new Float32Array(width * height),
    biome: new Uint8Array(width * height),
    water: new Float32Array(width * height)
  };
}
