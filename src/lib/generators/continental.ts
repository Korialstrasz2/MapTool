import type {
  GeneratorContext,
  GeneratorFamily,
  GeneratorRunner
} from '$lib/types/generatorCatalog';
import { fbmNoise2D, ridgedNoise2D, warpCoordinates } from '$lib/utils/noise';
import {
  blurHeightmap,
  finalizeTerrain,
  normalizeHeightmap
} from '$lib/utils/terrainProcessing';

function createContinentalRunner(): GeneratorRunner {
  return {
    async generate(context: GeneratorContext) {
      const { width, height, seed, parameters } = context;
      const heightmap = new Float32Array(width * height);
      const moistureField = new Float32Array(width * height);

      const {
        macroScale,
        ridgeContrast,
        warpStrength,
        seaLevel,
        humidity
      } = parameters;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          const nx = (x / width) * 2 - 1;
          const ny = (y / height) * 2 - 1;

          const [wx, wy] = warpCoordinates(nx, ny, seed, warpStrength * 0.002, 0.9);

          const macro = fbmNoise2D(wx * macroScale, wy * macroScale, {
            octaves: 4,
            lacunarity: 1.8,
            gain: 0.55,
            scale: 0.7,
            seed: seed ^ 0x51f5d7
          });

          const ridge = ridgedNoise2D(wx * 5.2, wy * 5.2, {
            octaves: 5,
            lacunarity: 2.05,
            gain: 0.48,
            scale: 0.95,
            seed: seed ^ 0x77a5b4
          });

          const plateau = fbmNoise2D(wx * 2.5 + macro * 1.2, wy * 2.5 - macro * 0.7, {
            octaves: 3,
            lacunarity: 2,
            gain: 0.6,
            scale: 0.85,
            seed: seed ^ 0x5c11c9
          });

          const base = macro * 0.55 + plateau * 0.35 + ridge * ridgeContrast - 0.15;
          heightmap[index] = base;

          const humidityNoise = fbmNoise2D(wx * 3.1, wy * 3.1, {
            octaves: 4,
            lacunarity: 2.1,
            gain: 0.5,
            scale: 0.9,
            seed: seed ^ 0xa24c7b
          });

          const latitudeInfluence = 1 - Math.abs((y / height) * 2 - 1);
          moistureField[index] = Math.min(
            1,
            Math.max(0, humidity * 0.5 + humidityNoise * 0.4 + latitudeInfluence * 0.2)
          );
        }
      }

      blurHeightmap(heightmap, width, height, 1);
      normalizeHeightmap(heightmap);

      const terrain = finalizeTerrain(width, height, heightmap, moistureField, {
        seaLevel,
        moistureScale: Math.max(0.5, humidity * 1.2)
      });

      return {
        width,
        height,
        ...terrain
      };
    }
  };
}

export const continentalFamily: GeneratorFamily = {
  id: 'continental-blueprint',
  name: 'Continental Blueprint',
  description:
    'Large-scale continental plates with sweeping mountain arcs and fertile interiors, tuned for realistic landmasses.',
  tags: ['continental', 'macro', 'realistic'],
  variants: [
    {
      id: 'temperate-belts',
      name: 'Temperate Belts',
      description: 'Classic mid-latitude continents with moderate humidity.',
      parameterOverrides: {
        seaLevel: 0.5,
        macroScale: 0.8,
        ridgeContrast: 0.5,
        warpStrength: 45,
        humidity: 0.6
      }
    },
    {
      id: 'dry-continents',
      name: 'Dry Continents',
      description: 'Higher sea level and sparse moisture for arid interiors.',
      parameterOverrides: {
        seaLevel: 0.55,
        macroScale: 0.9,
        ridgeContrast: 0.4,
        warpStrength: 30,
        humidity: 0.35
      }
    },
    {
      id: 'lush-supercontinent',
      name: 'Lush Supercontinent',
      description: 'Lower oceans and dense humidity for a massive, lush landmass.',
      parameterOverrides: {
        seaLevel: 0.46,
        macroScale: 0.7,
        ridgeContrast: 0.65,
        warpStrength: 60,
        humidity: 0.8
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
      defaultValue: 0.5
    },
    {
      id: 'macroScale',
      label: 'Macro scale',
      type: 'range',
      min: 0.5,
      max: 1.5,
      step: 0.05,
      defaultValue: 0.8,
      description: 'Size of continental plates; smaller values produce larger landmasses.'
    },
    {
      id: 'ridgeContrast',
      label: 'Ridge contrast',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      defaultValue: 0.5,
      description: 'Intensity of orogenic belts slicing across the continent.'
    },
    {
      id: 'warpStrength',
      label: 'Shear warp',
      type: 'range',
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 45,
      description: 'Simulated plate shear twisting the continental outlines.'
    },
    {
      id: 'humidity',
      label: 'Baseline humidity',
      type: 'range',
      min: 0.2,
      max: 1,
      step: 0.05,
      defaultValue: 0.6,
      description: 'Average interior humidity before rivers and lakes.'
    }
  ],
  async createRunner() {
    return createContinentalRunner();
  }
};
