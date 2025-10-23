import type {
  GeneratorControlSection,
  GeneratorDefinition,
  GeneratorId,
  GeneratorParameterControl,
  GeneratorSettings
} from '$lib/types/generation';

export const GENERATOR_DEFINITIONS: GeneratorDefinition[] = [
  {
    id: 'continental',
    name: 'Continental Plates',
    tagline: 'High-resolution tectonic terrain with erosion.',
    description:
      'Leverages the WebAssembly terrain solver for broad continental masses, erosion, and moisture transport.',
    statusMessage: 'Running high-resolution erosion solver…',
    sections: [
      {
        id: 'terrain',
        label: 'Terrain',
        parameters: [
          {
            key: 'seaLevel',
            label: 'Sea level',
            min: 0.2,
            max: 0.7,
            step: 0.01,
            defaultValue: 0.48,
            precision: 2
          },
          {
            key: 'elevationAmplitude',
            label: 'Elevation amplitude',
            min: 0.4,
            max: 1.5,
            step: 0.05,
            defaultValue: 0.9,
            precision: 2
          },
          {
            key: 'warpStrength',
            label: 'Warp strength',
            min: 0,
            max: 200,
            step: 5,
            defaultValue: 80,
            precision: 0
          }
        ]
      },
      {
        id: 'erosion',
        label: 'Erosion & climate',
        parameters: [
          {
            key: 'erosionIterations',
            label: 'Erosion iterations',
            min: 0,
            max: 8,
            step: 1,
            defaultValue: 2,
            integer: true
          },
          {
            key: 'moistureScale',
            label: 'Moisture scale',
            min: 0.2,
            max: 2,
            step: 0.05,
            defaultValue: 1,
            precision: 2
          }
        ]
      }
    ]
  },
  {
    id: 'archipelago',
    name: 'Island Chains',
    tagline: 'Shallow seas and volcanic arcs.',
    description:
      'Generates sprawling archipelagos with adjustable shoreline roughness, volcanic uplift, and trade-wind moisture.',
    statusMessage: 'Assembling island chain topology…',
    sections: [
      {
        id: 'islands',
        label: 'Islands',
        parameters: [
          {
            key: 'islandDensity',
            label: 'Island density',
            min: 0.3,
            max: 1.6,
            step: 0.05,
            defaultValue: 0.9,
            precision: 2
          },
          {
            key: 'shorelineRoughness',
            label: 'Shoreline roughness',
            min: 0,
            max: 1.2,
            step: 0.05,
            defaultValue: 0.45,
            precision: 2
          },
          {
            key: 'volcanicActivity',
            label: 'Volcanic activity',
            min: 0.2,
            max: 2.2,
            step: 0.1,
            defaultValue: 1.1,
            precision: 1
          }
        ]
      },
      {
        id: 'climate',
        label: 'Climate',
        parameters: [
          {
            key: 'tradeWinds',
            label: 'Trade-wind moisture',
            min: 0,
            max: 1.6,
            step: 0.05,
            defaultValue: 0.7,
            precision: 2
          }
        ]
      }
    ]
  },
  {
    id: 'ridge-basin',
    name: 'Ridge & Basin',
    tagline: 'Linear mountain belts and deep basins.',
    description:
      'Synthesizes alternating ridges and sunken basins reminiscent of Basin and Range provinces with configurable uplift.',
    statusMessage: 'Folding crust into linear mountain systems…',
    sections: [
      {
        id: 'tectonics',
        label: 'Tectonics',
        parameters: [
          {
            key: 'ridgeCount',
            label: 'Ridge count',
            min: 1,
            max: 6,
            step: 1,
            defaultValue: 3,
            integer: true
          },
          {
            key: 'ridgeSharpness',
            label: 'Ridge sharpness',
            min: 0.6,
            max: 2.4,
            step: 0.05,
            defaultValue: 1.2,
            precision: 2
          },
          {
            key: 'upliftStrength',
            label: 'Uplift strength',
            min: 0.4,
            max: 1.6,
            step: 0.05,
            defaultValue: 1,
            precision: 2
          }
        ]
      },
      {
        id: 'basins',
        label: 'Basins & climate',
        parameters: [
          {
            key: 'basinDepth',
            label: 'Basin depth',
            min: 0.1,
            max: 0.7,
            step: 0.02,
            defaultValue: 0.35,
            precision: 2
          },
          {
            key: 'glacierLine',
            label: 'Snow line',
            min: 0.35,
            max: 0.85,
            step: 0.02,
            defaultValue: 0.58,
            precision: 2
          }
        ]
      }
    ]
  },
  {
    id: 'weitou-delta',
    name: 'Weitou Delta',
    tagline: 'Coastal terraces inspired by Weitou villages.',
    description:
      'Inspired by historical Weitou (walled) villages and their deltas—mix tidal flats, terraced agriculture, and fortified settlements.',
    statusMessage: 'Carving tidal flats and walled terraces…',
    sections: [
      {
        id: 'coast',
        label: 'Coastline',
        parameters: [
          {
            key: 'inletPosition',
            label: 'Inlet position',
            min: 0.3,
            max: 0.75,
            step: 0.01,
            defaultValue: 0.48,
            precision: 2
          },
          {
            key: 'tidalAmplitude',
            label: 'Tidal amplitude',
            min: 0.05,
            max: 0.45,
            step: 0.01,
            defaultValue: 0.18,
            precision: 2
          },
          {
            key: 'harborCurve',
            label: 'Harbor curvature',
            min: 0,
            max: 1,
            step: 0.05,
            defaultValue: 0.55,
            precision: 2
          }
        ]
      },
      {
        id: 'terraces',
        label: 'Terraces & paddies',
        parameters: [
          {
            key: 'terraceSteps',
            label: 'Terrace steps',
            min: 2,
            max: 9,
            step: 1,
            defaultValue: 5,
            integer: true
          },
          {
            key: 'paddyIrrigation',
            label: 'Paddy irrigation',
            min: 0.2,
            max: 1.4,
            step: 0.05,
            defaultValue: 0.8,
            precision: 2
          },
          {
            key: 'wallProminence',
            label: 'Village walls',
            min: 0.2,
            max: 0.9,
            step: 0.05,
            defaultValue: 0.55,
            precision: 2
          }
        ]
      }
    ]
  }
];

const GENERATOR_INDEX = new Map<GeneratorId, GeneratorDefinition>(
  GENERATOR_DEFINITIONS.map((definition) => [definition.id, definition])
);

export function getGeneratorDefinition(id: GeneratorId): GeneratorDefinition {
  const definition = GENERATOR_INDEX.get(id);
  if (!definition) {
    throw new Error(`Unknown generator id: ${id}`);
  }
  return definition;
}

export function createDefaultSettings(definition: GeneratorDefinition): GeneratorSettings {
  const settings: GeneratorSettings = {};
  for (const section of definition.sections) {
    for (const parameter of section.parameters) {
      settings[parameter.key] = parameter.defaultValue;
    }
  }
  return settings;
}

export function mergeWithDefaults(
  definition: GeneratorDefinition,
  current?: GeneratorSettings
): GeneratorSettings {
  const defaults = createDefaultSettings(definition);
  if (!current) {
    return defaults;
  }

  const merged: GeneratorSettings = { ...defaults };
  for (const [key, value] of Object.entries(current)) {
    if (key in merged) {
      merged[key] = value;
    }
  }
  return merged;
}

export function formatSettingValue(
  control: GeneratorParameterControl,
  value: number | undefined
): string {
  const resolved = value ?? control.defaultValue;
  if (control.integer) {
    return Math.round(resolved).toString();
  }

  const precision = control.precision ?? (control.step < 1 ? 2 : 0);
  const formatted = resolved.toFixed(precision);
  return control.unit ? `${formatted}${control.unit}` : formatted;
}

export function flattenSections(
  sections: GeneratorControlSection[]
): GeneratorParameterControl[] {
  return sections.flatMap((section) => section.parameters);
}
