import type { GeneratorType } from '$lib/types/generation';

export interface GeneratorMetadata {
  type: GeneratorType;
  label: string;
  description: string;
  longDescription: string;
}

export const GENERATOR_METADATA: GeneratorMetadata[] = [
  {
    type: 'continental',
    label: 'Continental plates',
    description: 'Large landmasses separated by inland seas and mountain chains.',
    longDescription:
      'Layered fractal noise with plate-inspired warping generates broad continents, with coastlines shaped by warp strength and erosion smoothing.'
  },
  {
    type: 'archipelago',
    label: 'Fragmented archipelago',
    description: 'Chains of islands, lagoons, and coral atolls orbiting a shallow sea.',
    longDescription:
      'Radial falloff combined with choppy noise yields clusters of islands. Feature scale controls island spacing while river strength affects interior lagoons.'
  },
  {
    type: 'highlands',
    label: 'Crumpled highlands',
    description: 'Ridged mountain belts with glacial plateaus and deep valleys.',
    longDescription:
      'Ridged fractal synthesis produces alpine regions, where erosion iterations smooth foothills and warp strength fractures ranges into rifts.'
  },
  {
    type: 'weitou-delta',
    label: 'Weitou delta',
    description: 'River-delta lowlands inspired by the Pearl River estuary around Weitou.',
    longDescription:
      'A tidal slope feeds branching distributaries across reclaimed fields. River strength widens channels while temperature bias shifts subtropical humidity.'
  }
];

export const GENERATOR_LABELS: Record<GeneratorType, string> = GENERATOR_METADATA.reduce(
  (labels, meta) => ({ ...labels, [meta.type]: meta.label }),
  {} as Record<GeneratorType, string>
);
