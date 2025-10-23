import type {
  GeneratorEngineDefinition,
  GeneratorOptionDefinition,
  GeneratorVariantDefinition
} from '$lib/types/generation';

function formatTenths(value: number): string {
  return value.toFixed(1);
}

function formatHundredths(value: number): string {
  return value.toFixed(2);
}

const terrainOptions: GeneratorOptionDefinition[] = [
  {
    id: 'seaLevel',
    label: 'Sea level',
    min: 0.2,
    max: 0.7,
    step: 0.01,
    format: formatHundredths
  },
  {
    id: 'elevationAmplitude',
    label: 'Elevation amplitude',
    min: 0.4,
    max: 1.6,
    step: 0.05,
    format: formatHundredths
  },
  {
    id: 'warpStrength',
    label: 'Warp strength',
    min: 0,
    max: 220,
    step: 5,
    format: (value) => value.toFixed(0)
  },
  {
    id: 'erosionIterations',
    label: 'Erosion iterations',
    min: 0,
    max: 10,
    step: 1,
    format: (value) => value.toFixed(0)
  },
  {
    id: 'moistureScale',
    label: 'Moisture scale',
    min: 0.2,
    max: 2,
    step: 0.05,
    format: formatHundredths
  }
];

const terrainVariants: GeneratorVariantDefinition[] = [
  {
    id: 'temperate-standard',
    name: 'Temperate standard',
    description:
      'Balanced parameters inspired by Watabou\'s generator – varied continents with temperate climate.',
    optionDefaults: {
      seaLevel: 0.48,
      elevationAmplitude: 0.9,
      warpStrength: 80,
      erosionIterations: 2,
      moistureScale: 1.0
    }
  },
  {
    id: 'rugged-mountains',
    name: 'Rugged mountains',
    description: 'Steeper height ranges, deeper erosion and lower sea levels for highland maps.',
    optionDefaults: {
      seaLevel: 0.4,
      elevationAmplitude: 1.25,
      warpStrength: 140,
      erosionIterations: 4,
      moistureScale: 0.8
    }
  },
  {
    id: 'coral-archipelago',
    name: 'Coral archipelago',
    description: 'Higher seas and gentle peaks to create scattered island chains reminiscent of atolls.',
    optionDefaults: {
      seaLevel: 0.62,
      elevationAmplitude: 0.65,
      warpStrength: 60,
      erosionIterations: 1,
      moistureScale: 1.3
    }
  }
];

const fractalOptions: GeneratorOptionDefinition[] = [
  {
    id: 'roughness',
    label: 'Roughness',
    description: 'Controls how quickly details fall off across octaves of fractal noise.',
    min: 0.25,
    max: 0.85,
    step: 0.05,
    format: formatHundredths
  },
  {
    id: 'baseMoisture',
    label: 'Base moisture',
    min: 0.1,
    max: 0.9,
    step: 0.05,
    format: formatHundredths
  },
  {
    id: 'riverBoost',
    label: 'River boost',
    description: 'How strongly steep slopes carve additional rivers.',
    min: 0.5,
    max: 2.5,
    step: 0.1,
    format: formatTenths
  }
];

const fractalVariants: GeneratorVariantDefinition[] = [
  {
    id: 'craggy-spires',
    name: 'Craggy spires',
    description: 'Sharp peaks and dry basins – inspired by tabletop badlands generators.',
    optionDefaults: {
      roughness: 0.45,
      baseMoisture: 0.35,
      riverBoost: 1.6
    }
  },
  {
    id: 'rolling-hills',
    name: 'Rolling hills',
    description: 'Soft undulations and fertile valleys similar to procedural plains maps.',
    optionDefaults: {
      roughness: 0.65,
      baseMoisture: 0.55,
      riverBoost: 1.1
    }
  },
  {
    id: 'frozen-wastes',
    name: 'Frozen wastes',
    description: 'Low moisture and gentle slopes influenced by polar Watabou presets.',
    optionDefaults: {
      roughness: 0.3,
      baseMoisture: 0.2,
      riverBoost: 0.8
    }
  }
];

const voronoiOptions: GeneratorOptionDefinition[] = [
  {
    id: 'cellCount',
    label: 'Province count',
    description: 'Number of Voronoi control points that sculpt tectonic plates.',
    min: 6,
    max: 48,
    step: 1,
    format: (value) => value.toFixed(0)
  },
  {
    id: 'ridgeSharpness',
    label: 'Ridge sharpness',
    min: 0.2,
    max: 1.2,
    step: 0.05,
    format: formatHundredths
  },
  {
    id: 'seaLevel',
    label: 'Sea level',
    min: 0.25,
    max: 0.75,
    step: 0.01,
    format: formatHundredths
  }
];

const voronoiVariants: GeneratorVariantDefinition[] = [
  {
    id: 'continental-plates',
    name: 'Continental plates',
    description: 'Large crustal plates colliding with deep inland seas.',
    optionDefaults: {
      cellCount: 14,
      ridgeSharpness: 0.75,
      seaLevel: 0.48
    }
  },
  {
    id: 'shattered-realms',
    name: 'Shattered realms',
    description: 'Numerous fractured provinces separated by dramatic ridges.',
    optionDefaults: {
      cellCount: 28,
      ridgeSharpness: 0.9,
      seaLevel: 0.52
    }
  },
  {
    id: 'rift-seas',
    name: 'Rift seas',
    description: 'Sparse plates torn apart by high seas creating complex coastlines.',
    optionDefaults: {
      cellCount: 10,
      ridgeSharpness: 0.6,
      seaLevel: 0.6
    }
  }
];

const archipelagoOptions: GeneratorOptionDefinition[] = [
  {
    id: 'noiseScale',
    label: 'Noise scale',
    description: 'Primary wavelength of the layered simplex-style noise field.',
    min: 1.5,
    max: 8,
    step: 0.25,
    format: formatTenths
  },
  {
    id: 'islandFactor',
    label: 'Island factor',
    description: 'How strongly the coastline retreats toward the centre of the map.',
    min: 0.2,
    max: 1.2,
    step: 0.05,
    format: formatHundredths
  },
  {
    id: 'moistureJitter',
    label: 'Moisture jitter',
    min: 0,
    max: 0.8,
    step: 0.05,
    format: formatHundredths
  }
];

const archipelagoVariants: GeneratorVariantDefinition[] = [
  {
    id: 'emerald-chain',
    name: 'Emerald chain',
    description: 'Tropical archipelagos with lush jungles and lagoons.',
    optionDefaults: {
      noiseScale: 3.2,
      islandFactor: 0.55,
      moistureJitter: 0.55
    }
  },
  {
    id: 'misty-atolls',
    name: 'Misty atolls',
    description: 'Low islands surrounded by shallow seas, influenced by Watabou\'s coastal presets.',
    optionDefaults: {
      noiseScale: 2.4,
      islandFactor: 0.8,
      moistureJitter: 0.35
    }
  },
  {
    id: 'stormbound-reaches',
    name: 'Stormbound reaches',
    description: 'Sparse equatorial islands battered by intense squalls.',
    optionDefaults: {
      noiseScale: 4.5,
      islandFactor: 0.45,
      moistureJitter: 0.7
    }
  }
];

export const GENERATOR_ENGINES: GeneratorEngineDefinition[] = [
  {
    id: 'terrain-wasm',
    name: 'Terrain simulation (WASM)',
    description:
      'Hybrid hydraulic and thermal erosion system compiled from Rust. Closest to Watabou\'s island generator.',
    variants: terrainVariants,
    options: terrainOptions
  },
  {
    id: 'fractal-highlands',
    name: 'Fractal highlands',
    description: 'Diamond-square inspired fractal generator with river overlays.',
    variants: fractalVariants,
    options: fractalOptions
  },
  {
    id: 'voronoi-realms',
    name: 'Voronoi realms',
    description: 'Plate-style generator using Voronoi diagrams to carve continents.',
    variants: voronoiVariants,
    options: voronoiOptions
  },
  {
    id: 'noisy-archipelago',
    name: 'Noisy archipelago',
    description: 'Layered noise fields warped by radial falloff for stylised island chains.',
    variants: archipelagoVariants,
    options: archipelagoOptions
  }
];

export const ENGINE_MAP = new Map(GENERATOR_ENGINES.map((engine) => [engine.id, engine]));

export function getEngineDefinition(id: string | undefined | null) {
  return (id && ENGINE_MAP.get(id as GeneratorEngineDefinition['id'])) || null;
}

export function getVariantDefinition(
  engine: GeneratorEngineDefinition | null,
  variantId: string | undefined | null
): GeneratorVariantDefinition | null {
  if (!engine) {
    return null;
  }
  return engine.variants.find((variant) => variant.id === variantId) ?? null;
}

export function resolveOptionValue(
  engine: GeneratorEngineDefinition,
  variant: GeneratorVariantDefinition,
  overrides: Record<string, number>
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const option of engine.options) {
    const override = overrides[option.id];
    const fromVariant = variant.optionDefaults[option.id];
    values[option.id] =
      typeof override === 'number'
        ? override
        : typeof fromVariant === 'number'
          ? fromVariant
          : option.min;
  }
  return values;
}

export function getDefaultParameters() {
  const engine = GENERATOR_ENGINES[0];
  const variant = engine.variants[0];
  return {
    engine,
    variant,
    options: resolveOptionValue(engine, variant, {})
  };
}
