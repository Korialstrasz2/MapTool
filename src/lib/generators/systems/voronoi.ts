import type { GeneratorParameters, GeneratorResult } from '$lib/types/generation';
import {
  blurField,
  clamp,
  createRng,
  finalizeResult,
  fractalNoise,
  smoothStep,
  upscaleBilinear
} from './common';

interface VoronoiSite {
  x: number;
  y: number;
  elevation: number;
  moisture: number;
  bias: number;
}

function relaxSites(
  sites: VoronoiSite[],
  sampleWidth: number,
  sampleHeight: number
): void {
  const accumX = new Float32Array(sites.length);
  const accumY = new Float32Array(sites.length);
  const counts = new Uint32Array(sites.length);

  for (let sy = 0; sy < sampleHeight; sy += 1) {
    const ny = sy / (sampleHeight - 1);
    for (let sx = 0; sx < sampleWidth; sx += 1) {
      const nx = sx / (sampleWidth - 1);
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < sites.length; i += 1) {
        const dx = nx - sites[i].x;
        const dy = ny - sites[i].y;
        const d = dx * dx + dy * dy;
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
        }
      }
      accumX[bestIndex] += nx;
      accumY[bestIndex] += ny;
      counts[bestIndex] += 1;
    }
  }

  for (let i = 0; i < sites.length; i += 1) {
    if (counts[i] === 0) continue;
    sites[i].x = accumX[i] / counts[i];
    sites[i].y = accumY[i] / counts[i];
  }
}

export function runVoronoiGenerator(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed, values } = params;
  const seaLevel = values.seaLevel ?? 0.48;
  const cellCount = Math.max(12, Math.round(values.cellCount ?? 80));
  const relaxations = Math.max(0, Math.round(values.relaxations ?? 2));
  const ridgeSharpness = clamp(values.ridgeSharpness ?? 1.2, 0.2, 3.5);
  const moistureContrast = clamp(values.moistureContrast ?? 1.2, 0.3, 3.5);
  const coastlineDepth = clamp(values.coastlineDepth ?? 0.18, 0.02, 0.45);

  const rng = createRng(seed, 'voronoi');
  const sites: VoronoiSite[] = Array.from({ length: cellCount }, () => {
    const angleBias = rng() * Math.PI * 2;
    const bias = 0.2 + rng() * 0.6;
    return {
      x: rng(),
      y: rng(),
      elevation: 0.35 + rng() * 0.65,
      moisture: 0.25 + rng() * 0.75,
      bias: Math.cos(angleBias) * bias
    };
  });

  const sampleWidth = Math.max(64, Math.floor(width / 4));
  const sampleHeight = Math.max(64, Math.floor(height / 4));

  for (let iter = 0; iter < relaxations; iter += 1) {
    relaxSites(sites, sampleWidth, sampleHeight);
  }

  const coarseHeight = new Float32Array(sampleWidth * sampleHeight);
  const coarseMoisture = new Float32Array(sampleWidth * sampleHeight);

  for (let sy = 0; sy < sampleHeight; sy += 1) {
    const ny = sy / (sampleHeight - 1);
    for (let sx = 0; sx < sampleWidth; sx += 1) {
      const nx = sx / (sampleWidth - 1);
      let nearest = -1;
      let secondNearest = -1;
      let nearestDist = Number.POSITIVE_INFINITY;
      let secondDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < sites.length; i += 1) {
        const site = sites[i];
        const dx = nx - site.x;
        const dy = ny - site.y;
        const dist = Math.hypot(dx, dy);
        if (dist < nearestDist) {
          secondDist = nearestDist;
          secondNearest = nearest;
          nearestDist = dist;
          nearest = i;
        } else if (dist < secondDist) {
          secondDist = dist;
          secondNearest = i;
        }
      }
      if (nearest === -1) continue;
      const site = sites[nearest];
      const neighborDist = secondNearest === -1 ? nearestDist : secondDist;
      const ridgeDelta = neighborDist <= 0 ? 0 : clamp((neighborDist - nearestDist) / neighborDist, 0, 1);
      const ridgeFactor = Math.pow(ridgeDelta, ridgeSharpness);
      const noise = fractalNoise(nx + site.x, ny + site.y, 4, 2.6, 0.55, seed + 97);
      const edgeDistance = Math.min(nx, ny, 1 - nx, 1 - ny);
      const coastlineDrop = clamp(1 - edgeDistance / coastlineDepth, 0, 1);
      const basin = smoothStep(clamp(1 - nearestDist * (2.2 - site.bias), 0, 1));

      let heightValue = site.elevation * 0.55 + ridgeFactor * 0.4 + basin * 0.25;
      heightValue += (noise - 0.5) * 0.18;
      heightValue -= coastlineDrop * (0.35 + site.elevation * 0.25);
      const index = sy * sampleWidth + sx;
      coarseHeight[index] = heightValue;

      let humidity = site.moisture * moistureContrast;
      humidity += (1 - ridgeFactor) * 0.2;
      humidity += coastlineDrop * 0.45;
      humidity += (noise - 0.5) * 0.1;
      coarseMoisture[index] = humidity;
    }
  }

  blurField(coarseHeight, sampleWidth, sampleHeight, 2);
  blurField(coarseMoisture, sampleWidth, sampleHeight, 1);

  const heightField = upscaleBilinear(coarseHeight, sampleWidth, sampleHeight, width, height);
  const moistureField = upscaleBilinear(coarseMoisture, sampleWidth, sampleHeight, width, height);

  for (let i = 0; i < heightField.length; i += 1) {
    const yIndex = Math.floor(i / width);
    const xIndex = i - yIndex * width;
    const lat = yIndex / (height - 1);
    const latitudeBias = smoothStep(1 - Math.abs(lat - 0.5) * 2);
    heightField[i] += (fractalNoise(xIndex, yIndex, 2, 0.04, 0.5, seed + 131) - 0.5) * 0.05;
    moistureField[i] += latitudeBias * 0.1;
  }

  return finalizeResult(width, height, heightField, moistureField, seaLevel);
}
