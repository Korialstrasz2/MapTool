import seedrandom from 'seedrandom';

import type { GeneratorParameters, GeneratorResult, GeneratorSettings } from '$lib/types/generation';
import { clamp, computeSlopeFlow, lerp, normalizeArray, pickBiome } from './generator-utils';

function indexToCoord(index: number, width: number): { x: number; y: number } {
  const x = index % width;
  const y = Math.floor(index / width);
  return { x, y };
}

function normalCoord(value: number, max: number): number {
  if (max <= 1) {
    return 0;
  }
  return value / (max - 1);
}

function createSettlements(
  heightmap: Float32Array,
  width: number,
  height: number,
  limit: number,
  seaLevel: number
): Array<{ id: number; x: number; y: number; size: number }> {
  const candidates: Array<{ index: number; height: number }> = [];
  for (let i = 0; i < heightmap.length; i += 1) {
    if (heightmap[i] > seaLevel + 0.05) {
      candidates.push({ index: i, height: heightmap[i] });
    }
  }
  candidates.sort((a, b) => b.height - a.height);

  return candidates.slice(0, limit).map(({ index, height: h }, i) => {
    const { x, y } = indexToCoord(index, width);
    return { id: i + 1, x, y, size: Math.round(lerp(4, 10, clamp(h, 0, 1))) };
  });
}

export function generateArchipelago(
  params: GeneratorParameters,
  settings: GeneratorSettings
): GeneratorResult {
  const { width, height, seed } = params;
  const rng = seedrandom(String(seed >>> 0));
  const size = width * height;

  const rawHeight = new Float32Array(size);
  const heightmap = new Float32Array(size);
  const moisture = new Float32Array(size);
  const temperature = new Float32Array(size);
  const water = new Float32Array(size);
  const biome = new Uint8Array(size);

  const islandDensity = clamp(settings.islandDensity ?? 0.9, 0.3, 1.6);
  const shorelineRoughness = clamp(settings.shorelineRoughness ?? 0.45, 0, 1.2);
  const volcanicActivity = clamp(settings.volcanicActivity ?? 1.1, 0.2, 2.2);
  const tradeWinds = clamp(settings.tradeWinds ?? 0.7, 0, 1.6);

  const primaryCenterX = 0.5 + (rng.quick() - 0.5) * 0.18;
  const primaryCenterY = 0.47 + (rng.quick() - 0.5) * 0.16;
  const radialFalloff = 1.1 + (1.2 - islandDensity) * 0.5;

  const seaLevel = clamp(0.42 + (1.2 - islandDensity) * 0.12, 0.25, 0.65);
  const islandCount = Math.max(2, Math.round(4 + islandDensity * 6));
  const peaks = Array.from({ length: islandCount }, () => ({
    x: clamp(rng.quick(), 0.05, 0.95),
    y: clamp(rng.quick(), 0.1, 0.9),
    radius: 0.12 + rng.quick() * (0.25 / islandDensity),
    amplitude: 0.45 + rng.quick() * 0.6
  }));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const nx = normalCoord(x, width);
      const ny = normalCoord(y, height);

      const dx = nx - primaryCenterX;
      const dy = ny - primaryCenterY;
      const radial = 1 - Math.sqrt(dx * dx + dy * dy) * radialFalloff;

      let total = radial * 0.55;

      let islandContribution = 0;
      for (const peak of peaks) {
        const pdx = nx - peak.x;
        const pdy = ny - peak.y;
        const distance = Math.sqrt(pdx * pdx + pdy * pdy);
        const influence = Math.max(0, 1 - distance / peak.radius);
        const intensity = Math.pow(influence, 1.4 + volcanicActivity * 0.45) * peak.amplitude;
        islandContribution += intensity;
      }
      total += islandContribution / islandCount;

      const turbulence = (rng.quick() * 2 - 1) * shorelineRoughness * 0.25;
      const swell =
        (Math.sin((nx + seed * 0.0012) * Math.PI * 6) +
          Math.cos((ny - seed * 0.0009) * Math.PI * 4)) *
        shorelineRoughness * 0.08;

      rawHeight[index] = total + turbulence + swell;
    }
  }

  normalizeArray(rawHeight, 0, 1);

  for (let i = 0; i < size; i += 1) {
    const { x, y } = indexToCoord(i, width);
    const nx = normalCoord(x, width);
    const ny = normalCoord(y, height);
    const elevation = clamp(rawHeight[i], 0, 1);
    const depth = clamp(seaLevel - elevation, 0, 1);
    const coastal = clamp(1 - depth * 3.2, 0, 1);
    const equator = clamp(1 - Math.abs(ny - 0.5) * 1.6, 0, 1);
    const windBias = clamp(0.5 - (nx - 0.5), -1, 1);

    const moistureValue = clamp(
      equator * 0.45 + coastal * 0.55 + tradeWinds * windBias * 0.2,
      0,
      1
    );
    const temperatureValue = clamp(
      0.92 - Math.abs(ny - 0.5) * 1.8 - elevation * 0.55 + depth * 0.25,
      0,
      1
    );

    heightmap[i] = elevation;
    moisture[i] = moistureValue;
    temperature[i] = temperatureValue;
    water[i] = depth;
    biome[i] = pickBiome(elevation, moistureValue, temperatureValue);
  }

  const flow = computeSlopeFlow(heightmap, width, height);

  const settlements = createSettlements(heightmap, width, height, 4, seaLevel);
  const roadGraph = settlements.length >= 2
    ? settlements.slice(0, 4).flatMap((origin, idx, array) =>
        array.slice(idx + 1).map((target) => [origin.y * width + origin.x, target.y * width + target.x] as [number, number])
      )
    : undefined;

  return {
    width,
    height,
    heightmap,
    flow,
    moisture,
    temperature,
    biome,
    water,
    roadGraph,
    settlements: settlements.length > 0 ? settlements : undefined
  };
}

export function generateRidgeBasin(
  params: GeneratorParameters,
  settings: GeneratorSettings
): GeneratorResult {
  const { width, height, seed } = params;
  const rng = seedrandom(String(seed >>> 0));
  const size = width * height;

  const rawHeight = new Float32Array(size);
  const heightmap = new Float32Array(size);
  const moisture = new Float32Array(size);
  const temperature = new Float32Array(size);
  const water = new Float32Array(size);
  const biome = new Uint8Array(size);

  const ridgeCount = Math.max(1, Math.round(settings.ridgeCount ?? 3));
  const ridgeSharpness = clamp(settings.ridgeSharpness ?? 1.2, 0.6, 2.4);
  const upliftStrength = clamp(settings.upliftStrength ?? 1, 0.4, 1.6);
  const basinDepth = clamp(settings.basinDepth ?? 0.35, 0.1, 0.7);
  const glacierLine = clamp(settings.glacierLine ?? 0.58, 0.35, 0.85);

  const baseOrientation = rng.quick() * Math.PI * 2;
  const ridgeDescriptors = Array.from({ length: ridgeCount }, (_, i) => {
    const angle = baseOrientation + (i - ridgeCount / 2) * (Math.PI / ridgeCount) * (0.6 + rng.quick() * 0.7);
    const frequency = 0.8 + rng.quick() * 1.6;
    const phase = rng.quick() * Math.PI * 2;
    const amplitude = upliftStrength * (0.6 + rng.quick() * 0.5);
    return { angle, frequency, phase, amplitude };
  });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const nx = normalCoord(x, width);
      const ny = normalCoord(y, height);

      let value = 0.18;
      for (const ridge of ridgeDescriptors) {
        const projection = Math.cos(ridge.angle) * nx + Math.sin(ridge.angle) * ny;
        const ridgeWave = Math.cos((projection + ridge.phase) * ridge.frequency * Math.PI * 2);
        const intensity = Math.pow(Math.max(0, ridgeWave), ridgeSharpness) * ridge.amplitude;
        value += intensity;
      }

      const basinX = Math.abs(nx - 0.5);
      const basinY = Math.abs(ny - 0.5);
      const basin = Math.pow(1 - Math.sqrt(basinX * basinX + basinY * basinY), 2);
      value -= (1 - basin) * basinDepth;

      const noise = (rng.quick() * 2 - 1) * 0.08;
      rawHeight[index] = value + noise;
    }
  }

  normalizeArray(rawHeight, 0, 1);

  for (let i = 0; i < size; i += 1) {
    const { x, y } = indexToCoord(i, width);
    const nx = normalCoord(x, width);
    const ny = normalCoord(y, height);
    const elevation = clamp(rawHeight[i], 0, 1);

    const basinInfluence = Math.max(0, basinDepth - (1 - elevation));
    const waterDepth = clamp(basinDepth * 1.35 - elevation * 0.9, 0, 1);
    const valley = clamp(1 - Math.abs(nx - 0.5) * 2, 0, 1) * clamp(1 - elevation, 0, 1);

    const moistureValue = clamp(valley * 0.6 + waterDepth * 0.7 + basinInfluence * 0.5, 0, 1);
    const temperatureValue = clamp(
      0.8 - Math.abs(ny - 0.5) * 1.4 - elevation * 0.8 - Math.max(0, elevation - glacierLine) * 1.6,
      0,
      1
    );

    heightmap[i] = elevation;
    moisture[i] = moistureValue;
    temperature[i] = temperatureValue;
    water[i] = waterDepth;
    biome[i] = pickBiome(elevation, moistureValue, temperatureValue);
  }

  const flow = computeSlopeFlow(heightmap, width, height);

  const ridgelineRoad: [number, number][] = [];
  if (width > 2 && height > 2) {
    const ridgeY = Math.floor(height / 2);
    const start = ridgeY * width + Math.floor(width * 0.2);
    const end = ridgeY * width + Math.floor(width * 0.8);
    ridgelineRoad.push([start, end]);
  }

  return {
    width,
    height,
    heightmap,
    flow,
    moisture,
    temperature,
    biome,
    water,
    roadGraph: ridgelineRoad.length ? ridgelineRoad : undefined
  };
}

export function generateWeitouDelta(
  params: GeneratorParameters,
  settings: GeneratorSettings
): GeneratorResult {
  const { width, height, seed } = params;
  const rng = seedrandom(String(seed >>> 0));
  const size = width * height;

  const heightmap = new Float32Array(size);
  const moisture = new Float32Array(size);
  const temperature = new Float32Array(size);
  const water = new Float32Array(size);
  const biome = new Uint8Array(size);

  const inletPosition = clamp(settings.inletPosition ?? 0.48, 0.3, 0.75);
  const tidalAmplitude = clamp(settings.tidalAmplitude ?? 0.18, 0.05, 0.45);
  const harborCurve = clamp(settings.harborCurve ?? 0.55, 0, 1);
  const terraceSteps = Math.max(2, Math.round(settings.terraceSteps ?? 5));
  const paddyIrrigation = clamp(settings.paddyIrrigation ?? 0.8, 0.2, 1.4);
  const wallProminence = clamp(settings.wallProminence ?? 0.55, 0.2, 0.9);

  const coastBias = (rng.quick() - 0.5) * 0.08;
  const terraceHeight = 0.025 + paddyIrrigation * 0.01;
  const settlementX = Math.floor(width * lerp(0.4, 0.6, harborCurve));
  const settlementY = Math.floor(height * (inletPosition + 0.06));

  let maxElevation = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const nx = normalCoord(x, width);
      const ny = normalCoord(y, height);

      const tide = Math.sin((nx + harborCurve * 0.3) * Math.PI * 2) * tidalAmplitude;
      const coastline = inletPosition + tide + coastBias;
      const deltaDistance = ny - coastline;

      let elevation = 0.18 + Math.max(0, -deltaDistance) * 0.2;
      if (deltaDistance > 0) {
        elevation += Math.exp(-deltaDistance * 3) * 0.25;
      }

      const terraceBand = clamp(1 - Math.abs(deltaDistance) * (terraceSteps * 0.9), 0, 1);
      const stepped = Math.floor(terraceBand * terraceSteps) * terraceHeight;
      elevation += stepped;

      const riverFan = Math.exp(-Math.pow(Math.abs(nx - 0.5) * 3.2, 2)) * Math.exp(-Math.max(0, deltaDistance) * 5);
      elevation += riverFan * 0.35;

      const wallDistance = Math.hypot(x - settlementX, y - settlementY) / Math.max(width, height);
      elevation += Math.max(0, 0.12 * wallProminence - wallDistance * 0.4) * wallProminence;

      const irrigated = clamp(0.25 - deltaDistance * 1.1, 0, 1) * paddyIrrigation;
      const tidalWater = clamp(-deltaDistance * (1 + tidalAmplitude * 0.9), 0, 1);

      water[index] = Math.max(irrigated, tidalWater);
      moisture[index] = clamp(irrigated * 0.8 + tidalWater * 0.9 + riverFan * 0.6, 0, 1);

      const elevationClamped = clamp(elevation, 0, 1.4);
      heightmap[index] = elevationClamped;
      if (elevationClamped > maxElevation) {
        maxElevation = elevationClamped;
      }

      const latitude = Math.abs(0.5 - ny) * 2;
      const temperatureValue = clamp(0.85 - latitude * 0.7 - elevationClamped * 0.4 + water[index] * 0.15, 0, 1);
      temperature[index] = temperatureValue;
    }
  }

  if (maxElevation > 1) {
    normalizeArray(heightmap, 0, 1);
  }

  for (let i = 0; i < size; i += 1) {
    heightmap[i] = clamp(heightmap[i], 0, 1);
    const elevation = heightmap[i];
    moisture[i] = clamp(moisture[i], 0, 1);
    temperature[i] = clamp(temperature[i], 0, 1);
    water[i] = clamp(water[i], 0, 1);
    biome[i] = pickBiome(elevation, moisture[i], temperature[i]);
  }

  const flow = computeSlopeFlow(heightmap, width, height);

  const settlement = {
    id: 1,
    x: settlementX,
    y: settlementY,
    size: Math.round(lerp(6, 14, wallProminence))
  };
  const harborNode = Math.max(0, Math.min(size - 1, (settlementY - Math.floor(height * 0.08)) * width + settlementX));
  const villageNode = settlement.y * width + settlement.x;
  const terraceNode = Math.min(size - 1, villageNode + Math.floor(width * 0.15));

  const roadGraph: Array<[number, number]> = [
    [villageNode, harborNode],
    [villageNode, terraceNode]
  ];

  return {
    width,
    height,
    heightmap,
    flow,
    moisture,
    temperature,
    biome,
    water,
    roadGraph,
    settlements: [settlement]
  };
}
