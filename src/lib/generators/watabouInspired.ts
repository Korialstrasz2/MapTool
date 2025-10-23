import type {
  GeneratorContext,
  GeneratorFamily,
  GeneratorRunner
} from '$lib/types/generatorCatalog';
import { fbmNoise2D, ridgedNoise2D, warpCoordinates } from '$lib/utils/noise';
import {
  finalizeTerrain,
  normalizeHeightmap,
  blurHeightmap
} from '$lib/utils/terrainProcessing';

function createWatabouRunner(): GeneratorRunner {
  return {
    async generate(context: GeneratorContext) {
      const { width, height, seed, parameters } = context;
      const heightmap = new Float32Array(width * height);
      const moistureField = new Float32Array(width * height);

      const {
        seaLevel,
        coastlineComplexity,
        ridgeStrength,
        warpAmount,
        moistureNoiseScale
      } = parameters;

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(centerX, centerY);

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          const dx = (x - centerX) / radius;
          const dy = (y - centerY) / radius;
          const distance = Math.sqrt(dx * dx + dy * dy);

          const angle = Math.atan2(dy, dx);
          const ridge = Math.pow(Math.cos(angle * 2.5 + ridgeStrength * 0.75), 2);
          const coastFalloff = Math.pow(1 - Math.min(1, distance), coastlineComplexity);

          const [wx, wy] = warpCoordinates(
            dx,
            dy,
            seed >>> 0,
            warpAmount * 0.0025,
            1.2
          );

          const noise = fbmNoise2D(wx * 2.4, wy * 2.4, {
            octaves: 5,
            lacunarity: 2.05,
            gain: 0.55,
            scale: 0.8,
            seed: seed ^ 0x9e3779b9
          });

          const ridges = ridgedNoise2D(wx * 3.7 + ridgeStrength * 0.2, wy * 3.7, {
            octaves: 4,
            lacunarity: 1.9,
            gain: 0.5,
            scale: 0.9,
            seed: seed ^ 0x45d9f3b
          });

          const base = coastFalloff + noise * 0.65 + ridges * 0.25 - distance * 0.55;
          heightmap[index] = base;

          const moistNoise = fbmNoise2D(wx * moistureNoiseScale, wy * moistureNoiseScale, {
            octaves: 4,
            lacunarity: 2,
            gain: 0.55,
            scale: 1,
            seed: seed ^ 0x6c8e9cf5
          });

          moistureField[index] = Math.min(1, Math.max(0, moistNoise * 0.5 + 0.5));
        }
      }

      blurHeightmap(heightmap, width, height, 1);
      normalizeHeightmap(heightmap);

      const terrain = finalizeTerrain(width, height, heightmap, moistureField, {
        seaLevel,
        moistureScale: parameters.moistureNoiseScale
      });

      return {
        width,
        height,
        ...terrain
      };
    }
  };
}

export const watabouInspiredFamily: GeneratorFamily = {
  id: 'watabou-inspired',
  name: 'Watabou-style Islands',
  description:
    "Compact island maps inspired by Watabou's procgen sketches, blending radial falloff with warped noise ridges.",
  tags: ['island', 'watabou', 'coastal'],
  variants: [
    {
      id: 'classic-isle',
      name: 'Classic Isle',
      description: 'Single compact island with a soft coastline and central highlands.',
      parameterOverrides: {
        seaLevel: 0.54,
        coastlineComplexity: 2.2,
        ridgeStrength: 0.6,
        warpAmount: 32,
        moistureNoiseScale: 1.4
      }
    },
    {
      id: 'caldera-ring',
      name: 'Caldera Ring',
      description: 'Raised rim with a sunk core, evoking volcanic atolls.',
      parameterOverrides: {
        seaLevel: 0.58,
        coastlineComplexity: 2.6,
        ridgeStrength: 1.1,
        warpAmount: 45,
        moistureNoiseScale: 1.1
      }
    },
    {
      id: 'shattered-archipelago',
      name: 'Shattered Archipelago',
      description: 'Broken islands and complex shorelines for adventurous coastlines.',
      parameterOverrides: {
        seaLevel: 0.6,
        coastlineComplexity: 3.2,
        ridgeStrength: 0.9,
        warpAmount: 70,
        moistureNoiseScale: 1.8
      }
    }
  ],
  parameters: [
    {
      id: 'seaLevel',
      label: 'Sea level',
      type: 'range',
      min: 0.3,
      max: 0.75,
      step: 0.01,
      defaultValue: 0.54
    },
    {
      id: 'coastlineComplexity',
      label: 'Coastline tightness',
      type: 'range',
      min: 1.2,
      max: 4,
      step: 0.1,
      defaultValue: 2.2,
      description: 'Higher values yield sharper coastal drops and more enclosed bays.'
    },
    {
      id: 'ridgeStrength',
      label: 'Ridge strength',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.05,
      defaultValue: 0.6,
      description: 'Controls the angular ridges characteristic of Watabou-like islands.'
    },
    {
      id: 'warpAmount',
      label: 'Warp amount',
      type: 'range',
      min: 0,
      max: 120,
      step: 1,
      defaultValue: 32,
      description: 'How strongly to warp the island layout for irregular coastlines.'
    },
    {
      id: 'moistureNoiseScale',
      label: 'Moisture texture scale',
      type: 'range',
      min: 0.6,
      max: 2.5,
      step: 0.05,
      defaultValue: 1.4,
      description: 'Granularity of the humidity noise field.'
    }
  ],
  async createRunner() {
    return createWatabouRunner();
  }
};
