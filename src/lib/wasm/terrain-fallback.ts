import seedrandom from 'seedrandom';
import type { TerrainGeneration, TerrainWasmModule } from './terrain';
import { clamp, pickBiome } from '$lib/workers/generator-utils';

interface LegacyGeneratorParameters {
  width: number;
  height: number;
  seed: number;
  seaLevel: number;
  elevationAmplitude: number;
  warpStrength: number;
  erosionIterations: number;
  moistureScale: number;
}

function createGenerator(seed: number, params: LegacyGeneratorParameters) {
  const rng = seedrandom(String(seed >>> 0));
  const { width, height, seaLevel, elevationAmplitude, warpStrength, erosionIterations, moistureScale } = params;

  return (x: number, y: number) => {
    const nx = x / Math.max(1, width - 1);
    const ny = y / Math.max(1, height - 1);

    const base = Math.sin((nx + ny) * Math.PI * 2 + seed * 0.0001);
    const ridge = Math.cos((nx - ny) * Math.PI * 1.5 + warpStrength * 0.25);
    const jitter = rng.quick() * 2 - 1;
    const erosionFactor = clamp(1 - erosionIterations * 0.0015, 0.5, 1);

    const rawElevation = (base * 0.6 + ridge * 0.4 + jitter * 0.15 * warpStrength) * erosionFactor;
    const normalizedElevation = clamp((rawElevation + 1) / 2, 0, 1) * clamp(elevationAmplitude, 0.1, 5);

    const latitude = Math.abs(0.5 - ny) * 2;
    const temperature = clamp(1 - latitude - normalizedElevation * 0.6 + seaLevel * 0.2, 0, 1);
    const moisture = clamp(
      (Math.cos(nx * Math.PI * 2 + seed * 0.0003) + 1) / 2 * clamp(moistureScale, 0.1, 4) * (1 - normalizedElevation * 0.3),
      0,
      1
    );

    const depth = clamp(seaLevel - normalizedElevation, 0, 1);

    return {
      elevation: normalizedElevation,
      water: depth,
      moisture,
      temperature,
      biome: pickBiome(normalizedElevation, moisture, temperature)
    };
  };
}

const fallbackModule: TerrainWasmModule = {
  generate_map(
    width,
    height,
    seed,
    seaLevel,
    elevationAmplitude,
    warpStrength,
    erosionIterations,
    moistureScale
  ) {
    const size = width * height;
    const heightmap = new Float32Array(size);
    const flow = new Float32Array(size);
    const moisture = new Float32Array(size);
    const temperature = new Float32Array(size);
    const biome = new Uint8Array(size);
    const water = new Float32Array(size);

    const params: LegacyGeneratorParameters = {
      width,
      height,
      seed,
      seaLevel,
      elevationAmplitude,
      warpStrength,
      erosionIterations,
      moistureScale
    };
    const generator = createGenerator(seed, params);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const result = generator(x, y);
        heightmap[index] = result.elevation;
        water[index] = result.water;
        moisture[index] = result.moisture;
        temperature[index] = result.temperature;
        biome[index] = result.biome;
        flow[index] = Math.max(0, result.water - 0.05);
      }
    }

    const generation: TerrainGeneration = {
      width,
      height,
      heightmap,
      flow,
      moisture,
      temperature,
      biome,
      water
    };

    return generation;
  }
};

export default fallbackModule;
