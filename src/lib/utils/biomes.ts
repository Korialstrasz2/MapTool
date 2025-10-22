import type { BiomeId } from '$lib/types/generation';

export const BIOMES: BiomeId[] = [
  'ocean',
  'lake',
  'tundra',
  'boreal-forest',
  'temperate-forest',
  'temperate-grassland',
  'tropical-forest',
  'savanna',
  'desert',
  'alpine'
];

export function decodeBiome(index: number): BiomeId {
  return BIOMES[index] ?? 'temperate-grassland';
}
