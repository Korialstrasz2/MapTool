import type { GeneratorParameters } from '$lib/types/generation';
import { clamp } from './noise';

interface BiomeReference {
  elevation: number;
  moisture: number;
  temperature: number;
  index: number;
}

const BIOME_REFERENCES: BiomeReference[] = [
  { elevation: 0.15, moisture: 0.6, temperature: 0.9, index: 0 },
  { elevation: 0.2, moisture: 0.8, temperature: 0.8, index: 1 },
  { elevation: 0.4, moisture: 0.35, temperature: 0.3, index: 2 },
  { elevation: 0.5, moisture: 0.55, temperature: 0.35, index: 3 },
  { elevation: 0.55, moisture: 0.75, temperature: 0.45, index: 4 },
  { elevation: 0.5, moisture: 0.5, temperature: 0.6, index: 5 },
  { elevation: 0.6, moisture: 0.9, temperature: 0.8, index: 6 },
  { elevation: 0.55, moisture: 0.55, temperature: 0.85, index: 7 },
  { elevation: 0.35, moisture: 0.3, temperature: 0.95, index: 8 },
  { elevation: 0.75, moisture: 0.45, temperature: 0.3, index: 9 }
];

export function pickBiome(
  elevation: number,
  waterDepth: number,
  moisture: number,
  temperature: number,
  params: GeneratorParameters
): number {
  if (waterDepth > 0.55) {
    return 0;
  }

  if (waterDepth > 0.35 && elevation < clamp(params.seaLevel + 0.05, 0, 1)) {
    return 1;
  }

  let best = BIOME_REFERENCES[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of BIOME_REFERENCES) {
    const dElevation = Math.abs(candidate.elevation - elevation);
    const dMoisture = Math.abs(candidate.moisture - moisture);
    const dTemperature = Math.abs(candidate.temperature - temperature);
    const score = dElevation * 1.8 + dMoisture * 1.2 + dTemperature;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best.index;
}
