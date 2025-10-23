import type {
  GeneratorContext,
  GeneratorFamily,
  GeneratorRunner
} from '$lib/types/generatorCatalog';
import { fbmNoise2D } from '$lib/utils/noise';
import {
  blurHeightmap,
  finalizeTerrain,
  normalizeHeightmap
} from '$lib/utils/terrainProcessing';

function createBrushRunner(): GeneratorRunner {
  return {
    async generate(context: GeneratorContext) {
      const { width, height, seed, parameters } = context;
      const heightmap = new Float32Array(width * height);
      const moistureField = new Float32Array(width * height);

      const { seaLevel, roughness, plateauFactor } = parameters;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          const nx = (x / width) * 2 - 1;
          const ny = (y / height) * 2 - 1;
          const radial = Math.pow(1 - Math.min(1, Math.sqrt(nx * nx + ny * ny)), plateauFactor);

          const noise = fbmNoise2D(nx * 2.3, ny * 2.3, {
            octaves: 4,
            lacunarity: 2,
            gain: 0.55,
            scale: Math.max(0.4, 1 - roughness * 0.4),
            seed: seed ^ 0x1234abcd
          });

          heightmap[index] = radial + noise * roughness * 0.6;
          moistureField[index] = 0.5;
        }
      }

      blurHeightmap(heightmap, width, height, 1);
      normalizeHeightmap(heightmap);

      const terrain = finalizeTerrain(width, height, heightmap, moistureField, {
        seaLevel,
        moistureScale: 1
      });

      return {
        width,
        height,
        ...terrain
      };
    }
  };
}

export const brushFamily: GeneratorFamily = {
  id: 'brush-sculptor',
  name: 'Interactive Sculptor',
  description:
    'Start from a malleable base map and reshape coastlines with an interactive height brush.',
  tags: ['interactive', 'sculpt', 'custom'],
  variants: [
    {
      id: 'uplifted-plateau',
      name: 'Uplifted Plateau',
      description: 'High central mass ready for carving valleys.',
      parameterOverrides: {
        seaLevel: 0.48,
        roughness: 0.7,
        plateauFactor: 1.8
      }
    },
    {
      id: 'sunken-basin',
      name: 'Sunken Basin',
      description: 'Hollow interior primed for lakes and custom highlands.',
      parameterOverrides: {
        seaLevel: 0.52,
        roughness: 0.55,
        plateauFactor: 0.9
      }
    },
    {
      id: 'open-plains',
      name: 'Open Plains',
      description: 'Gently rolling terrain ideal for manual mountain placement.',
      parameterOverrides: {
        seaLevel: 0.5,
        roughness: 0.35,
        plateauFactor: 1.2
      }
    }
  ],
  parameters: [
    {
      id: 'seaLevel',
      label: 'Sea level',
      type: 'range',
      min: 0.35,
      max: 0.7,
      step: 0.01,
      defaultValue: 0.48
    },
    {
      id: 'roughness',
      label: 'Base roughness',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.6,
      description: 'Amount of procedural noise before hand sculpting.'
    },
    {
      id: 'plateauFactor',
      label: 'Plateau factor',
      type: 'range',
      min: 0.6,
      max: 2.2,
      step: 0.05,
      defaultValue: 1.5,
      description: 'Adjusts central elevation bias for the base terrain.'
    }
  ],
  async createRunner() {
    return createBrushRunner();
  }
};
