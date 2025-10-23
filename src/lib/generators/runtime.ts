import type { GeneratorParameters, GeneratorResult, GeneratorEngineId } from '$lib/types/generation';
import { loadTerrainWasm } from '$lib/wasm/terrain';
import type { TerrainWasmModule } from '$lib/wasm/terrain';
import { BIOMES } from '$lib/utils/biomes';
import type { BiomeId } from '$lib/types/generation';

interface GeneratorEngineRuntime {
  run: (params: GeneratorParameters) => Promise<GeneratorResult>;
}

function createTerrainRuntime(): GeneratorEngineRuntime {
  let modulePromise: Promise<TerrainWasmModule> | null = null;

  async function resolveModule(): Promise<TerrainWasmModule> {
    if (!modulePromise) {
      modulePromise = loadTerrainWasm();
    }
    return modulePromise;
  }

  return {
    async run(params: GeneratorParameters) {
      const module = await resolveModule();
      const options = params.options;

      const result = module.generate_map(
        params.width,
        params.height,
        params.seed >>> 0,
        options.seaLevel ?? 0.5,
        options.elevationAmplitude ?? 1,
        options.warpStrength ?? 60,
        options.erosionIterations ?? 2,
        options.moistureScale ?? 1
      );

      return {
        width: result.width,
        height: result.height,
        heightmap: result.heightmap.slice(),
        flow: result.flow.slice(),
        moisture: result.moisture.slice(),
        temperature: result.temperature.slice(),
        biome: result.biome.slice(),
        water: result.water.slice(),
        roadGraph: result.roadGraph ? result.roadGraph.map((entry) => [...entry] as [number, number]) : undefined,
        settlements: result.settlements ? result.settlements.map((settlement) => ({ ...settlement })) : undefined
      } satisfies GeneratorResult;
    }
  };
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2d(x: number, y: number, seed: number): number {
  let h = seed >>> 0;
  h ^= Math.imul(x | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= Math.imul(y | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x1b873593);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);

  const v00 = hash2d(x0, y0, seed);
  const v10 = hash2d(x1, y0, seed);
  const v01 = hash2d(x0, y1, seed);
  const v11 = hash2d(x1, y1, seed);

  const nx0 = lerp(v00, v10, tx);
  const nx1 = lerp(v01, v11, tx);
  return lerp(nx0, nx1, ty);
}

function fractalNoise(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  persistence: number,
  lacunarity = 2
): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let totalAmplitude = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    const noise = valueNoise(x * frequency, y * frequency, seed + octave * 1013);
    sum += noise * amplitude;
    totalAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  if (totalAmplitude === 0) {
    return 0;
  }

  return sum / totalAmplitude;
}

const BIOME_INDEX = new Map<BiomeId, number>(BIOMES.map((id, index) => [id, index]));

function encodeBiome(id: BiomeId): number {
  return BIOME_INDEX.get(id) ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeBiome(
  height: number,
  moisture: number,
  temperature: number,
  water: number,
  seaLevel: number
): number {
  if (water > 0.6) {
    return encodeBiome(height < seaLevel - 0.05 ? 'ocean' : 'lake');
  }

  if (height > 0.82) {
    return encodeBiome('alpine');
  }

  if (temperature < 0.18) {
    return encodeBiome('tundra');
  }

  if (temperature < 0.32 && moisture > 0.5) {
    return encodeBiome('boreal-forest');
  }

  if (moisture > 0.75) {
    return encodeBiome(temperature > 0.55 ? 'tropical-forest' : 'temperate-forest');
  }

  if (moisture > 0.6) {
    return encodeBiome('temperate-forest');
  }

  if (moisture > 0.45) {
    return encodeBiome('temperate-grassland');
  }

  if (moisture > 0.28) {
    return encodeBiome('savanna');
  }

  return encodeBiome('desert');
}

function computeFlowField(heightmap: Float32Array, width: number, height: number): Float32Array {
  const flow = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const h = heightmap[idx];
      const left = x > 0 ? heightmap[idx - 1] : h;
      const right = x < width - 1 ? heightmap[idx + 1] : h;
      const top = y > 0 ? heightmap[idx - width] : h;
      const bottom = y < height - 1 ? heightmap[idx + width] : h;
      const dx = right - left;
      const dy = bottom - top;
      const magnitude = Math.sqrt(dx * dx + dy * dy) * 0.5;
      flow[idx] = clamp(magnitude, 0, 1);
    }
  }
  return flow;
}

function computeTemperature(height: number, yNorm: number): number {
  const latitude = Math.abs(yNorm - 0.5) * 2;
  const lapseRate = (1 - height) * 0.6;
  const base = 1 - latitude * 0.9;
  return clamp(base + lapseRate - height * 0.4, 0, 1);
}

function generateFractalHighlands(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed, options } = params;
  const roughness = clamp(options.roughness ?? 0.55, 0.2, 0.95);
  const baseMoisture = clamp(options.baseMoisture ?? 0.5, 0.05, 0.95);
  const riverBoost = clamp(options.riverBoost ?? 1.2, 0.4, 3.5);

  const heightmap = new Float32Array(width * height);
  const moisture = new Float32Array(width * height);
  const temperature = new Float32Array(width * height);
  const water = new Float32Array(width * height);
  const biome = new Uint8Array(width * height);

  const persistence = lerp(0.35, 0.75, 1 - roughness);
  const seaLevel = clamp(0.48 - (baseMoisture - 0.5) * 0.12, 0.35, 0.62);

  for (let y = 0; y < height; y += 1) {
    const yNorm = y / (height - 1 || 1);
    for (let x = 0; x < width; x += 1) {
      const xNorm = x / (width - 1 || 1);
      const idx = y * width + x;
      const elevation = fractalNoise(xNorm * 4, yNorm * 4, seed, 6, persistence);
      const ridge = Math.pow(Math.abs(0.5 - elevation) * 2, 1.35);
      const heightValue = clamp(elevation * 0.85 + ridge * 0.15, 0, 1);
      heightmap[idx] = heightValue;

      const humidityNoise = fractalNoise(xNorm * 3.2 + 7.13, yNorm * 3.2 + 4.98, seed ^ 0x9e3779b9, 5, 0.55);
      const humidity = clamp(baseMoisture * 0.6 + humidityNoise * 0.6, 0, 1);
      moisture[idx] = humidity;

      const temp = computeTemperature(heightValue, yNorm);
      temperature[idx] = temp;
    }
  }

  const flow = computeFlowField(heightmap, width, height);

  for (let i = 0; i < heightmap.length; i += 1) {
    const slope = flow[i];
    const depth = clamp((seaLevel - heightmap[i]) * 4, 0, 1);
    const rivers = clamp((slope - 0.05) * riverBoost, 0, 1);
    const waterValue = clamp(depth + rivers * (1 - heightmap[i]), 0, 1);
    water[i] = waterValue;
    biome[i] = computeBiome(heightmap[i], moisture[i], temperature[i], waterValue, seaLevel);
  }

  return {
    width,
    height,
    heightmap,
    flow,
    moisture,
    temperature,
    biome,
    water
  };
}

interface Point {
  x: number;
  y: number;
  heightBias: number;
}

function generateVoronoiRealms(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed, options } = params;
  const cellCount = Math.round(clamp(options.cellCount ?? 18, 3, 120));
  const ridgeSharpness = clamp(options.ridgeSharpness ?? 0.7, 0.1, 2.5);
  const seaLevel = clamp(options.seaLevel ?? 0.5, 0.25, 0.8);

  const rng = createRng(seed);
  const points: Point[] = [];

  for (let i = 0; i < cellCount; i += 1) {
    points.push({
      x: rng(),
      y: rng(),
      heightBias: rng()
    });
  }

  const heightmap = new Float32Array(width * height);
  const moisture = new Float32Array(width * height);
  const temperature = new Float32Array(width * height);
  const water = new Float32Array(width * height);
  const biome = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const yNorm = y / (height - 1 || 1);
    for (let x = 0; x < width; x += 1) {
      const xNorm = x / (width - 1 || 1);
      const idx = y * width + x;

      let nearest = Number.POSITIVE_INFINITY;
      let second = Number.POSITIVE_INFINITY;
      let bias = 0;

      for (const point of points) {
        const dx = xNorm - point.x;
        const dy = yNorm - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < nearest) {
          second = nearest;
          nearest = distance;
          bias = point.heightBias;
        } else if (distance < second) {
          second = distance;
        }
      }

      const ridge = clamp(Math.pow(second - nearest, 0.8) * ridgeSharpness, 0, 1);
      const continentalShelf = clamp(1 - nearest * 1.35 + bias * 0.25, 0, 1);
      const border = Math.min(xNorm, 1 - xNorm, yNorm, 1 - yNorm);
      const coastPull = clamp(border * 1.8, 0, 1);
      const heightValue = clamp(continentalShelf * 0.7 + ridge * 0.4 + coastPull * 0.2, 0, 1);
      heightmap[idx] = heightValue;

      const humidity = clamp(0.35 + (1 - nearest) * 0.5 + bias * 0.15, 0, 1);
      moisture[idx] = humidity;
      temperature[idx] = computeTemperature(heightValue, yNorm);
    }
  }

  const flow = computeFlowField(heightmap, width, height);

  for (let i = 0; i < heightmap.length; i += 1) {
    const shelf = clamp((seaLevel - heightmap[i]) * 5, 0, 1);
    const faultWater = clamp((flow[i] - 0.08) * 1.5, 0, 1);
    const waterValue = clamp(shelf + faultWater, 0, 1);
    water[i] = waterValue;
    biome[i] = computeBiome(heightmap[i], moisture[i], temperature[i], waterValue, seaLevel);
  }

  return {
    width,
    height,
    heightmap,
    flow,
    moisture,
    temperature,
    biome,
    water
  };
}

function generateNoisyArchipelago(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed, options } = params;
  const noiseScale = clamp(options.noiseScale ?? 3.2, 0.6, 12);
  const islandFactor = clamp(options.islandFactor ?? 0.6, 0.1, 1.6);
  const moistureJitter = clamp(options.moistureJitter ?? 0.4, 0, 1);

  const heightmap = new Float32Array(width * height);
  const moisture = new Float32Array(width * height);
  const temperature = new Float32Array(width * height);
  const water = new Float32Array(width * height);
  const biome = new Uint8Array(width * height);

  const seaLevel = 0.56 - islandFactor * 0.08;

  for (let y = 0; y < height; y += 1) {
    const yNorm = y / (height - 1 || 1);
    for (let x = 0; x < width; x += 1) {
      const xNorm = x / (width - 1 || 1);
      const idx = y * width + x;
      const centeredX = xNorm - 0.5;
      const centeredY = yNorm - 0.5;
      const radial = Math.sqrt(centeredX * centeredX + centeredY * centeredY);
      const baseNoise = fractalNoise(xNorm * noiseScale, yNorm * noiseScale, seed ^ 0x51e15, 5, 0.55, 2.3);
      const detailNoise = fractalNoise(xNorm * noiseScale * 2.1 + 12.34, yNorm * noiseScale * 2.1 + 45.6, seed ^ 0x9e37, 3, 0.6);
      const shape = clamp(baseNoise * 0.7 + detailNoise * 0.3, 0, 1);
      const falloff = clamp(1 - Math.pow(radial, islandFactor > 0.8 ? 1.8 : 1.4) * islandFactor * 1.4, -0.5, 1);
      const heightValue = clamp(shape * 0.9 + falloff, 0, 1);
      heightmap[idx] = heightValue;

      const humidityBase = fractalNoise(xNorm * 2.4 + 3.1, yNorm * 2.4 + 5.7, seed ^ 0x4bf1, 4, 0.6);
      const humidity = clamp(0.5 + (humidityBase - 0.5) * (1 + moistureJitter) + (1 - radial) * 0.2, 0, 1);
      moisture[idx] = humidity;
      temperature[idx] = computeTemperature(heightValue, yNorm);
    }
  }

  const flow = computeFlowField(heightmap, width, height);

  for (let i = 0; i < heightmap.length; i += 1) {
    const lagoon = clamp((seaLevel - heightmap[i]) * 4, 0, 1);
    const surf = clamp((flow[i] - 0.05) * 1.1, 0, 1);
    const waterValue = clamp(lagoon + surf, 0, 1);
    water[i] = waterValue;
    biome[i] = computeBiome(heightmap[i], moisture[i], temperature[i], waterValue, seaLevel);
  }

  return {
    width,
    height,
    heightmap,
    flow,
    moisture,
    temperature,
    biome,
    water
  };
}

const ENGINE_RUNTIME_FACTORIES: Record<GeneratorEngineId, () => GeneratorEngineRuntime> = {
  'terrain-wasm': createTerrainRuntime,
  'fractal-highlands': () => ({
    async run(params: GeneratorParameters) {
      return generateFractalHighlands(params);
    }
  }),
  'voronoi-realms': () => ({
    async run(params: GeneratorParameters) {
      return generateVoronoiRealms(params);
    }
  }),
  'noisy-archipelago': () => ({
    async run(params: GeneratorParameters) {
      return generateNoisyArchipelago(params);
    }
  })
};

const ENGINE_RUNTIME_CACHE = new Map<GeneratorEngineId, GeneratorEngineRuntime>();

function getRuntime(id: GeneratorEngineId): GeneratorEngineRuntime {
  if (!ENGINE_RUNTIME_CACHE.has(id)) {
    const factory = ENGINE_RUNTIME_FACTORIES[id];
    if (!factory) {
      throw new Error(`Unknown generator engine: ${id}`);
    }
    ENGINE_RUNTIME_CACHE.set(id, factory());
  }
  return ENGINE_RUNTIME_CACHE.get(id)!;
}

export async function runGenerator(params: GeneratorParameters): Promise<GeneratorResult> {
  const runtime = getRuntime(params.generatorId);
  return runtime.run(params);
}
