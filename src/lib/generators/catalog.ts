import type { GeneratorParameters, GeneratorSystemId } from '$lib/types/generation';

export interface GeneratorOptionDefinition {
  id: string;
  label: string;
  section: string;
  min: number;
  max: number;
  step: number;
  precision?: number;
  unit?: string;
  help?: string;
}

export interface GeneratorVariantDefinition {
  id: string;
  name: string;
  description: string;
  defaults: Record<string, number>;
}

export interface GeneratorDefinition {
  id: GeneratorSystemId;
  name: string;
  summary: string;
  inspiration?: string;
  options: GeneratorOptionDefinition[];
  variants: GeneratorVariantDefinition[];
}

export const generatorCatalog: GeneratorDefinition[] = [
  {
    id: 'terrain-wasm',
    name: 'Continental Heightfields',
    summary:
      'Procedural elevation synthesis based on layered simplex noise, erosion passes and biome tagging.',
    inspiration: 'Inspired by Watabou\'s fantasy world generator and continent-scale map projects.',
    options: [
      {
        id: 'seaLevel',
        label: 'Sea level',
        section: 'Terrain',
        min: 0.2,
        max: 0.75,
        step: 0.01,
        precision: 2,
        help: 'Controls the proportion of land versus water by offsetting the global waterline.'
      },
      {
        id: 'elevationAmplitude',
        label: 'Elevation amplitude',
        section: 'Terrain',
        min: 0.4,
        max: 1.6,
        step: 0.05,
        precision: 2,
        help: 'Scales the underlying noise-based mountain ranges. Higher values produce taller peaks.'
      },
      {
        id: 'warpStrength',
        label: 'Warp strength',
        section: 'Terrain',
        min: 0,
        max: 200,
        step: 5,
        precision: 0,
        help: 'Introduces continental shearing and coastal variety by warping the base noise domain.'
      },
      {
        id: 'erosionIterations',
        label: 'Erosion passes',
        section: 'Erosion',
        min: 0,
        max: 8,
        step: 1,
        precision: 0,
        help: 'Applies simplified thermal erosion to soften steep slopes and carve valleys.'
      },
      {
        id: 'moistureScale',
        label: 'Moisture scale',
        section: 'Climate',
        min: 0.25,
        max: 2.2,
        step: 0.05,
        precision: 2,
        help: 'Amplifies humidity sampling which directly feeds into biome classification.'
      }
    ],
    variants: [
      {
        id: 'balanced-continents',
        name: 'Balanced continents',
        description: 'Watabou-style inland seas and sprawling landmasses suited for campaign maps.',
        defaults: {
          seaLevel: 0.48,
          elevationAmplitude: 0.95,
          warpStrength: 80,
          erosionIterations: 2,
          moistureScale: 1.0
        }
      },
      {
        id: 'archipelago-expanse',
        name: 'Archipelago expanse',
        description: 'Scattered island chains, shallow shelves and tropical climates reminiscent of island generators.',
        defaults: {
          seaLevel: 0.6,
          elevationAmplitude: 0.75,
          warpStrength: 145,
          erosionIterations: 1,
          moistureScale: 1.35
        }
      },
      {
        id: 'highland-realms',
        name: 'Highland realms',
        description: 'Lower seas with craggy ridges and plateaus for a more rugged, continental interior.',
        defaults: {
          seaLevel: 0.38,
          elevationAmplitude: 1.35,
          warpStrength: 55,
          erosionIterations: 4,
          moistureScale: 0.85
        }
      }
    ]
  },
  {
    id: 'voronoi-provinces',
    name: 'Voronoi Provinces',
    summary:
      'Cellular heightfields grown from Lloyd-relaxed Voronoi regions for province and island-chain style worlds.',
    inspiration: 'Influenced by Watabou\'s city and region generators that rely on Voronoi partitions.',
    options: [
      {
        id: 'seaLevel',
        label: 'Sea level',
        section: 'Terrain',
        min: 0.25,
        max: 0.7,
        step: 0.01,
        precision: 2
      },
      {
        id: 'cellCount',
        label: 'Province count',
        section: 'Structure',
        min: 24,
        max: 140,
        step: 2,
        precision: 0,
        help: 'Number of Voronoi cells that define the macro scale. Higher values give smaller provinces.'
      },
      {
        id: 'relaxations',
        label: 'Relaxations',
        section: 'Structure',
        min: 0,
        max: 4,
        step: 1,
        precision: 0,
        help: 'Lloyd relaxation iterations to even out the cell layout.'
      },
      {
        id: 'ridgeSharpness',
        label: 'Ridge sharpness',
        section: 'Terrain',
        min: 0.4,
        max: 2.4,
        step: 0.05,
        precision: 2,
        help: 'Controls how quickly elevation drops when approaching provincial borders.'
      },
      {
        id: 'moistureContrast',
        label: 'Moisture contrast',
        section: 'Climate',
        min: 0.6,
        max: 2.5,
        step: 0.05,
        precision: 2,
        help: 'Amplifies the difference between arid and humid cells.'
      },
      {
        id: 'coastlineDepth',
        label: 'Coastline depth',
        section: 'Terrain',
        min: 0.05,
        max: 0.35,
        step: 0.01,
        precision: 2,
        help: 'Controls the falloff near the outer edge of the map to emphasise coastlines.'
      }
    ],
    variants: [
      {
        id: 'city-states',
        name: 'City-states mosaic',
        description: 'Dense inland provinces with gentle seas, ideal for political maps.',
        defaults: {
          seaLevel: 0.46,
          cellCount: 88,
          relaxations: 2,
          ridgeSharpness: 1.1,
          moistureContrast: 1.2,
          coastlineDepth: 0.18
        }
      },
      {
        id: 'shattered-isles',
        name: 'Shattered isles',
        description: 'Sparse relaxed cells that form broken archipelagos with deep water gaps.',
        defaults: {
          seaLevel: 0.54,
          cellCount: 52,
          relaxations: 1,
          ridgeSharpness: 1.6,
          moistureContrast: 1.45,
          coastlineDepth: 0.28
        }
      },
      {
        id: 'river-kingdoms',
        name: 'River kingdoms',
        description: 'Longitudinal cells with softer ridges and moist interiors for river-heavy regions.',
        defaults: {
          seaLevel: 0.42,
          cellCount: 96,
          relaxations: 3,
          ridgeSharpness: 0.85,
          moistureContrast: 1.75,
          coastlineDepth: 0.14
        }
      }
    ]
  },
  {
    id: 'tectonic-plates',
    name: 'Tectonic Plates',
    summary:
      'Simulated uplift and subduction fronts where moving plates collide, creating sweeping mountain arcs.',
    inspiration:
      'Combines tectonic sketches popularised by cartography blogs with research into procedural plate models.',
    options: [
      {
        id: 'seaLevel',
        label: 'Sea level',
        section: 'Terrain',
        min: 0.25,
        max: 0.7,
        step: 0.01,
        precision: 2
      },
      {
        id: 'plateCount',
        label: 'Plate count',
        section: 'Structure',
        min: 3,
        max: 12,
        step: 1,
        precision: 0,
        help: 'Number of active plates. More plates create intricate fault lines.'
      },
      {
        id: 'upliftStrength',
        label: 'Uplift strength',
        section: 'Terrain',
        min: 0.5,
        max: 2.4,
        step: 0.05,
        precision: 2,
        help: 'Controls how dramatic colliding plate boundaries become.'
      },
      {
        id: 'depressionStrength',
        label: 'Subduction depth',
        section: 'Terrain',
        min: 0.2,
        max: 1.5,
        step: 0.05,
        precision: 2,
        help: 'Sets the intensity of trenches and cratons where plates diverge.'
      },
      {
        id: 'faultBlur',
        label: 'Fault blur',
        section: 'Structure',
        min: 0.05,
        max: 0.45,
        step: 0.01,
        precision: 2,
        help: 'Softens or sharpens the transition between tectonic plates.'
      },
      {
        id: 'moistureGradient',
        label: 'Moisture gradient',
        section: 'Climate',
        min: -0.6,
        max: 0.6,
        step: 0.02,
        precision: 2,
        help: 'Tilts prevailing winds to bias rainfall toward one side of the map.'
      }
    ],
    variants: [
      {
        id: 'continental-drift',
        name: 'Continental drift',
        description: 'Balanced uplift and rift zones suited for classical world maps.',
        defaults: {
          seaLevel: 0.47,
          plateCount: 6,
          upliftStrength: 1.4,
          depressionStrength: 0.7,
          faultBlur: 0.22,
          moistureGradient: 0.1
        }
      },
      {
        id: 'ringworld',
        name: 'Ringworld orogeny',
        description: 'Emphasises a single sweeping collision zone encircling an inland basin.',
        defaults: {
          seaLevel: 0.43,
          plateCount: 5,
          upliftStrength: 2.1,
          depressionStrength: 0.55,
          faultBlur: 0.16,
          moistureGradient: -0.25
        }
      },
      {
        id: 'fractured-crust',
        name: 'Fractured crust',
        description: 'Many minor plates with subdued mountains and widespread shallow seas.',
        defaults: {
          seaLevel: 0.52,
          plateCount: 9,
          upliftStrength: 1.1,
          depressionStrength: 1.15,
          faultBlur: 0.32,
          moistureGradient: 0.3
        }
      }
    ]
  },
  {
    id: 'fractured-basins',
    name: 'Fractal Basins',
    summary:
      'Diamond-square fractals blended with basin carving and rainfall models for painterly regional maps.',
    inspiration: 'Pulls from classic fractal terrain techniques used in tabletop map tools and demoscene works.',
    options: [
      {
        id: 'seaLevel',
        label: 'Sea level',
        section: 'Terrain',
        min: 0.2,
        max: 0.75,
        step: 0.01,
        precision: 2
      },
      {
        id: 'roughness',
        label: 'Fractal roughness',
        section: 'Terrain',
        min: 0.3,
        max: 1.3,
        step: 0.02,
        precision: 2,
        help: 'Adjusts how quickly detail diminishes each subdivision.'
      },
      {
        id: 'basinStrength',
        label: 'Basin carving',
        section: 'Terrain',
        min: 0.0,
        max: 0.9,
        step: 0.02,
        precision: 2,
        help: 'Carves radial lowlands suitable for inland seas and crater worlds.'
      },
      {
        id: 'riverDensity',
        label: 'River density',
        section: 'Hydrology',
        min: 0.1,
        max: 1.0,
        step: 0.02,
        precision: 2,
        help: 'Influences how much precipitation is converted into runoff.'
      },
      {
        id: 'moistureRamp',
        label: 'Moisture ramp',
        section: 'Climate',
        min: 0.4,
        max: 1.6,
        step: 0.05,
        precision: 2,
        help: 'Scales the humidity field derived from the fractal detail.'
      }
    ],
    variants: [
      {
        id: 'cradle-seas',
        name: 'Cradle seas',
        description: 'Gentle fractal relief with broad basins and fertile coastlines.',
        defaults: {
          seaLevel: 0.5,
          roughness: 0.72,
          basinStrength: 0.35,
          riverDensity: 0.5,
          moistureRamp: 1.2
        }
      },
      {
        id: 'shattered-plateaus',
        name: 'Shattered plateaus',
        description: 'High contrast cliffs, deep chasms and sparse rainfall.',
        defaults: {
          seaLevel: 0.42,
          roughness: 1.08,
          basinStrength: 0.12,
          riverDensity: 0.28,
          moistureRamp: 0.75
        }
      },
      {
        id: 'stormworld',
        name: 'Stormworld basins',
        description: 'Moist fractal landscapes drenched in runoff and cloudforest biomes.',
        defaults: {
          seaLevel: 0.56,
          roughness: 0.65,
          basinStrength: 0.48,
          riverDensity: 0.82,
          moistureRamp: 1.45
        }
      }
    ]
  }
];

export function getGeneratorDefinition(systemId: GeneratorSystemId): GeneratorDefinition {
  const definition = generatorCatalog.find((entry) => entry.id === systemId);
  if (!definition) {
    throw new Error(`Unknown generator system: ${systemId}`);
  }
  return definition;
}

export function getVariantDefinition(
  systemId: GeneratorSystemId,
  variantId: string
): GeneratorVariantDefinition {
  const definition = getGeneratorDefinition(systemId);
  const variant = definition.variants.find((entry) => entry.id === variantId);
  if (!variant) {
    throw new Error(`Unknown variant: ${variantId} for ${systemId}`);
  }
  return variant;
}

export function createDefaultParameters(): GeneratorParameters {
  const defaultSystem = generatorCatalog[0];
  const defaultVariant = defaultSystem.variants[0];
  return {
    width: 512,
    height: 512,
    seed: 1337,
    systemId: defaultSystem.id,
    variantId: defaultVariant.id,
    values: { ...defaultVariant.defaults }
  };
}
