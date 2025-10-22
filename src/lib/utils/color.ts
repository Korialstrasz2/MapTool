import type { BiomeId } from '$lib/types/generation';

export interface HypsometricStop {
  elevation: number;
  color: [number, number, number];
}

const HYPSOMETRIC_STOPS: HypsometricStop[] = [
  { elevation: -1.0, color: [16, 32, 64] },
  { elevation: 0.0, color: [32, 64, 96] },
  { elevation: 0.02, color: [51, 93, 128] },
  { elevation: 0.05, color: [64, 112, 148] },
  { elevation: 0.1, color: [192, 168, 128] },
  { elevation: 0.2, color: [146, 169, 92] },
  { elevation: 0.4, color: [110, 139, 80] },
  { elevation: 0.6, color: [160, 120, 96] },
  { elevation: 0.8, color: [200, 200, 200] },
  { elevation: 1.0, color: [240, 240, 240] }
];

const BIOME_COLORS: Record<BiomeId, [number, number, number]> = {
  ocean: [32, 64, 128],
  lake: [42, 96, 160],
  tundra: [175, 196, 209],
  'boreal-forest': [68, 102, 80],
  'temperate-forest': [74, 128, 88],
  'temperate-grassland': [137, 169, 103],
  'tropical-forest': [66, 140, 62],
  savanna: [198, 172, 94],
  desert: [218, 192, 130],
  alpine: [210, 210, 210]
};

export function hypsometricColor(height: number): [number, number, number] {
  const clamped = Math.max(Math.min(height, 1), -1);
  for (let i = 0; i < HYPSOMETRIC_STOPS.length - 1; i += 1) {
    const current = HYPSOMETRIC_STOPS[i];
    const next = HYPSOMETRIC_STOPS[i + 1];
    if (clamped >= current.elevation && clamped <= next.elevation) {
      const t = (clamped - current.elevation) / (next.elevation - current.elevation);
      return [
        current.color[0] + (next.color[0] - current.color[0]) * t,
        current.color[1] + (next.color[1] - current.color[1]) * t,
        current.color[2] + (next.color[2] - current.color[2]) * t
      ];
    }
  }

  const last = HYPSOMETRIC_STOPS[HYPSOMETRIC_STOPS.length - 1];
  return last.color;
}

export function biomeColor(id: BiomeId): [number, number, number] {
  return BIOME_COLORS[id];
}
