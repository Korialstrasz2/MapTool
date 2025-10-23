import type { GeneratorFamily } from '$lib/types/generatorCatalog';
import { brushFamily } from './brush';
import { continentalFamily } from './continental';
import { tectonicFamily } from './tectonic';
import { watabouInspiredFamily } from './watabouInspired';

export const GENERATOR_FAMILIES: GeneratorFamily[] = [
  watabouInspiredFamily,
  continentalFamily,
  tectonicFamily,
  brushFamily
];

export const FAMILY_MAP = new Map(GENERATOR_FAMILIES.map((family) => [family.id, family]));
