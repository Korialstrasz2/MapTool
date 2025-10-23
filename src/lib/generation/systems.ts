import type { GeneratorParameters, GeneratorResult } from '$lib/types/generation';
import { pickBiome } from './biome';
import { clamp, domainWarp, fbm2D, ridgedFbm2D, smoothstep, valueNoise2D } from './noise';

interface MutableResult extends GeneratorResult {}

function createEmptyResult(width: number, height: number): MutableResult {
  const size = width * height;
  return {
    width,
    height,
    heightmap: new Float32Array(size),
    flow: new Float32Array(size),
    moisture: new Float32Array(size),
    temperature: new Float32Array(size),
    biome: new Uint8Array(size),
    water: new Float32Array(size)
  };
}

function applyCell(
  result: MutableResult,
  index: number,
  elevation: number,
  water: number,
  moisture: number,
  temperature: number,
  flow: number,
  params: GeneratorParameters
): void {
  const clampedElevation = clamp(elevation, 0, 1);
  const clampedWater = clamp(water, 0, 1);
  const clampedMoisture = clamp(moisture, 0, 1);
  const clampedTemperature = clamp(temperature, 0, 1);
  const clampedFlow = clamp(flow, 0, 1);

  result.heightmap[index] = clampedElevation;
  result.water[index] = clampedWater;
  result.moisture[index] = clampedMoisture;
  result.temperature[index] = clampedTemperature;
  result.flow[index] = clampedFlow;
  result.biome[index] = pickBiome(clampedElevation, clampedWater, clampedMoisture, clampedTemperature, params);
}

function generateContinental(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed } = params;
  const result = createEmptyResult(width, height);

  const amplitude = clamp(params.elevationAmplitude, 0.2, 3);
  const warp = clamp(params.warpStrength, 0, 400) / 220;
  const smoothing = clamp(params.erosionIterations, 0, 12) / 12;
  const featureScale = clamp(params.featureScale, 0.3, 3.5);
  const humidityScale = clamp(params.moistureScale, 0.2, 3);
  const relativeSea = clamp(params.seaLevel, 0.05, 0.95);
  const riverFactor = clamp(params.riverStrength, 0, 2);
  const temperatureBias = clamp(params.temperatureBias, -1, 1) * 0.5;

  for (let y = 0; y < height; y += 1) {
    const ny = height > 1 ? y / (height - 1) : 0;
    const py = ny - 0.5;
    for (let x = 0; x < width; x += 1) {
      const nx = width > 1 ? x / (width - 1) : 0;
      const px = nx - 0.5;
      const radial = Math.sqrt(px * px + py * py);
      const continentalShelf = 1 - smoothstep(0.28, 0.78, radial / clamp(0.8 / featureScale, 0.45, 1));

      const warped = domainWarp(
        px * featureScale * 1.4,
        py * featureScale * 1.4,
        seed,
        warp * 0.75,
        featureScale
      );

      const base = fbm2D(warped.x, warped.y, seed, {
        octaves: 5,
        gain: 0.52 + smoothing * 0.05,
        lacunarity: 2.08
      });
      const tectonic = fbm2D(px * featureScale * 0.7 + 40.5, py * featureScale * 0.7 + 81.2, seed + 551, {
        octaves: 3,
        gain: 0.6,
        lacunarity: 1.9
      });
      const detail = fbm2D(warped.x * 3.2, warped.y * 3.2, seed + 880, { octaves: 2, gain: 0.55, lacunarity: 2.4 });

      let raw = base * 0.55 + tectonic * 0.35 + detail * 0.15 + continentalShelf * 0.5 - 0.1;
      raw /= 1 + smoothing * 0.4;
      let elevation = clamp((raw + 1) / 2, 0, 1);
      elevation = Math.pow(elevation, 1.05 - smoothing * 0.3) * amplitude;

      const depth = clamp(relativeSea - elevation, 0, 1);
      const riverNoise = fbm2D(warped.x * 2.1 + 200, warped.y * 2.1 + 200, seed + 1200, {
        octaves: 3,
        gain: 0.58,
        lacunarity: 2.3
      });
      const riverMask = Math.pow(1 - Math.abs(riverNoise), 3);
      const rivers = clamp(riverMask - 0.55, 0, 1) * (riverFactor / 1.6) * (1 - elevation);
      const water = clamp(depth + rivers, 0, 1);

      const humidity = clamp((water * 0.65 + (1 - elevation) * 0.35) * humidityScale, 0, 1);
      const latitude = Math.abs(py) * 1.35;
      const temperature = clamp(1 - latitude - elevation * 0.55 + temperatureBias, 0, 1);
      const flow = clamp(water * 0.7 + rivers * 1.2, 0, 1);

      const index = y * width + x;
      applyCell(result, index, elevation, water, humidity, temperature, flow, params);
    }
  }

  return result;
}

function generateArchipelago(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed } = params;
  const result = createEmptyResult(width, height);

  const amplitude = clamp(params.elevationAmplitude, 0.15, 2.2);
  const warp = clamp(params.warpStrength, 0, 400) / 260;
  const smoothing = clamp(params.erosionIterations, 0, 12) / 12;
  const featureScale = clamp(params.featureScale, 0.4, 3.8);
  const humidityScale = clamp(params.moistureScale, 0.2, 3);
  const relativeSea = clamp(params.seaLevel + 0.05, 0.1, 0.95);
  const lagoonFactor = clamp(params.riverStrength, 0, 2);
  const temperatureBias = clamp(params.temperatureBias, -1, 1) * 0.5;

  for (let y = 0; y < height; y += 1) {
    const ny = height > 1 ? y / (height - 1) : 0;
    const py = ny - 0.5;
    for (let x = 0; x < width; x += 1) {
      const nx = width > 1 ? x / (width - 1) : 0;
      const px = nx - 0.5;
      const radial = Math.sqrt(px * px + py * py);
      const islandMask = 1 - smoothstep(0.25, 0.85, radial / clamp(0.65 / featureScale, 0.38, 1));

      const warped = domainWarp(
        px * featureScale * 1.9,
        py * featureScale * 1.9,
        seed + 302,
        warp,
        featureScale
      );

      const base = fbm2D(warped.x, warped.y, seed + 733, {
        octaves: 4,
        gain: 0.52 + smoothing * 0.04,
        lacunarity: 2.35
      });
      const choppiness = fbm2D(warped.x * 3.4, warped.y * 3.4, seed + 941, {
        octaves: 3,
        gain: 0.6,
        lacunarity: 2.6
      });
      const sandbars = valueNoise2D(px * featureScale * 5.6 + 910, py * featureScale * 5.6 + 122, seed + 1441) * 2 - 1;

      let raw = base * 0.65 + choppiness * 0.25 + sandbars * 0.1 + islandMask * 0.9 - 0.25;
      raw /= 1 + smoothing * 0.35;
      let elevation = clamp((raw + 1) / 2, 0, 1);
      elevation = Math.pow(elevation, 0.95 - smoothing * 0.25) * amplitude;

      const depth = clamp(relativeSea - elevation, 0, 1);
      const lagoonNoise = valueNoise2D(px * featureScale * 7.4 + 510, py * featureScale * 7.4 + 640, seed + 1603);
      const lagoons = Math.max(0, lagoonNoise - 0.58) * (lagoonFactor / 1.4) * islandMask;
      const water = clamp(depth + lagoons, 0, 1);

      const humidity = clamp((water * 0.75 + (1 - elevation) * 0.25) * humidityScale, 0, 1);
      const latitude = Math.abs(py) * 1.1;
      const temperature = clamp(0.9 - latitude * 0.8 - elevation * 0.35 + temperatureBias, 0, 1);
      const flow = clamp((water + lagoons) * 0.8, 0, 1);

      const index = y * width + x;
      applyCell(result, index, elevation, water, humidity, temperature, flow, params);
    }
  }

  return result;
}

function generateHighlands(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed } = params;
  const result = createEmptyResult(width, height);

  const amplitude = clamp(params.elevationAmplitude, 0.4, 3.5);
  const warp = clamp(params.warpStrength, 0, 400) / 200;
  const smoothing = clamp(params.erosionIterations, 0, 12) / 12;
  const featureScale = clamp(params.featureScale, 0.4, 3);
  const humidityScale = clamp(params.moistureScale, 0.2, 2.5);
  const relativeSea = clamp(params.seaLevel - 0.05, 0.02, 0.85);
  const riverFactor = clamp(params.riverStrength, 0, 2);
  const temperatureBias = clamp(params.temperatureBias, -1, 1) * 0.5;

  for (let y = 0; y < height; y += 1) {
    const ny = height > 1 ? y / (height - 1) : 0;
    const py = ny - 0.5;
    for (let x = 0; x < width; x += 1) {
      const nx = width > 1 ? x / (width - 1) : 0;
      const px = nx - 0.5;

      const warped = domainWarp(
        px * featureScale * 1.5,
        py * featureScale * 1.5,
        seed + 601,
        warp,
        featureScale
      );

      const ridged = ridgedFbm2D(warped.x * 1.9, warped.y * 1.9, seed + 1900, {
        octaves: 5,
        gain: 0.68 - smoothing * 0.1,
        lacunarity: 2.15
      });
      const base = fbm2D(warped.x, warped.y, seed + 1831, {
        octaves: 4,
        gain: 0.55,
        lacunarity: 2.05
      });
      const plateaus = fbm2D(px * featureScale * 0.8 + 310, py * featureScale * 0.8 + 540, seed + 2142, {
        octaves: 3,
        gain: 0.6,
        lacunarity: 1.8
      });

      let elevation = clamp(ridged * 1.2 + (base + 1) * 0.25 + (plateaus + 1) * 0.15 - 0.45, 0, 1);
      elevation = Math.pow(elevation, 0.85 - smoothing * 0.15) * amplitude * 1.05;

      const depth = clamp(relativeSea - elevation * 0.8, 0, 1);
      const valleyNoise = fbm2D(warped.x * 2.5 + 90, warped.y * 2.5 + 90, seed + 2281, {
        octaves: 3,
        gain: 0.6,
        lacunarity: 2.4
      });
      const valleys = Math.pow(1 - Math.abs(valleyNoise), 3);
      const rivers = clamp(valleys - 0.7, 0, 1) * (riverFactor / 1.8) * (1 - elevation);
      const water = clamp(depth + rivers * 0.8, 0, 1);

      const humidity = clamp((water * 0.45 + (1 - elevation) * 0.2) * humidityScale, 0, 1);
      const latitude = Math.abs(py) * 1.6;
      const temperature = clamp(0.75 - latitude - elevation * 0.8 + temperatureBias, 0, 1);
      const flow = clamp(rivers * 1.4 + water * 0.3, 0, 1);

      const index = y * width + x;
      applyCell(result, index, elevation, water, humidity, temperature, flow, params);
    }
  }

  return result;
}

function generateWeitouDelta(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed } = params;
  const result = createEmptyResult(width, height);

  const amplitude = clamp(params.elevationAmplitude, 0.2, 2.2);
  const warp = clamp(params.warpStrength, 0, 400) / 240;
  const smoothing = clamp(params.erosionIterations, 0, 12) / 12;
  const featureScale = clamp(params.featureScale, 0.6, 3.2);
  const humidityScale = clamp(params.moistureScale, 0.3, 3.2);
  const relativeSea = clamp(params.seaLevel + 0.08, 0.15, 0.95);
  const riverFactor = clamp(params.riverStrength, 0, 2);
  const temperatureBias = clamp(params.temperatureBias, -1, 1) * 0.65;

  for (let y = 0; y < height; y += 1) {
    const ny = height > 1 ? y / (height - 1) : 0;
    const py = ny - 0.5;
    for (let x = 0; x < width; x += 1) {
      const nx = width > 1 ? x / (width - 1) : 0;
      const px = nx - 0.5;

      const warped = domainWarp(
        px * featureScale * 1.2,
        py * featureScale,
        seed + 901,
        warp * 0.6,
        featureScale
      );

      const farmland = fbm2D(warped.x * 1.6, warped.y * 1.4, seed + 2400, {
        octaves: 3,
        gain: 0.6 - smoothing * 0.05,
        lacunarity: 1.9
      });
      const tidalSlope = smoothstep(0.45, 0.92, ny);
      const meander = Math.sin((px + 0.5) * (3.2 + featureScale * 1.5) + seed * 0.001) * 0.18;
      const branchNoise = fbm2D(px * 2.8 + 120, ny * 5.1 + 33, seed + 2601, {
        octaves: 3,
        gain: 0.65,
        lacunarity: 2.8
      });
      const riverCenter = meander + branchNoise * 0.08 - 0.1;
      const riverDistance = Math.abs(py - riverCenter);
      const channelWidth = 0.04 + riverFactor * 0.06;
      const riverMask = clamp(1 - riverDistance / channelWidth, 0, 1);
      const distributaries = clamp(branchNoise * 0.6 + riverMask, 0, 1);

      let elevation = clamp(0.28 + farmland * 0.25 - ny * 0.45 - riverMask * 0.35, 0, 1);
      elevation = Math.pow(elevation, 1.05 - smoothing * 0.1) * amplitude * 0.85;

      const tidalWater = smoothstep(0.55, 0.92, ny) * 0.45;
      const water = clamp(
        relativeSea + tidalWater - elevation + riverMask * 0.7 + distributaries * (riverFactor / 1.3),
        0,
        1
      );

      const humidity = clamp((water * 0.8 + riverMask * 0.4 + (1 - elevation) * 0.3) * humidityScale, 0, 1);
      const temperature = clamp(0.85 - ny * 0.35 - elevation * 0.25 + temperatureBias, 0, 1);
      const flow = clamp((riverMask * 1.4 + distributaries * 0.8) * (0.6 + riverFactor / 1.5), 0, 1);

      const index = y * width + x;
      applyCell(result, index, elevation, water, humidity, temperature, flow, params);
    }
  }

  return result;
}

export function runGenerator(params: GeneratorParameters): GeneratorResult {
  switch (params.generatorType) {
    case 'continental':
      return generateContinental(params);
    case 'archipelago':
      return generateArchipelago(params);
    case 'highlands':
      return generateHighlands(params);
    case 'weitou-delta':
      return generateWeitouDelta(params);
    default: {
      const exhaustive: never = params.generatorType;
      throw new Error(`Unsupported generator type: ${exhaustive}`);
    }
  }
}
