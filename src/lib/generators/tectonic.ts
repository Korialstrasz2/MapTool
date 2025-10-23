import type {
  GeneratorFamily,
  GeneratorRunner,
  GeneratorContext
} from '$lib/types/generatorCatalog';
import { loadTerrainWasm } from '$lib/wasm/terrain';
import type { TerrainWasmModule } from '$lib/wasm/terrain';

async function createTectonicRunner(): Promise<GeneratorRunner> {
  let module: TerrainWasmModule | null = null;

  async function ensureModule(): Promise<TerrainWasmModule> {
    if (!module) {
      module = await loadTerrainWasm();
    }
    return module;
  }

  return {
    async generate(context: GeneratorContext) {
      const terrain = await ensureModule();
      const {
        parameters: {
          seaLevel,
          elevationAmplitude,
          warpStrength,
          erosionIterations,
          moistureScale
        }
      } = context;

      const result = terrain.generate_map(
        context.width,
        context.height,
        context.seed >>> 0,
        seaLevel,
        elevationAmplitude,
        warpStrength,
        erosionIterations >>> 0,
        moistureScale
      );

      return {
        width: result.width,
        height: result.height,
        heightmap: result.heightmap.slice(),
        flow: result.flow.slice(),
        moisture: result.moisture.slice(),
        temperature: result.temperature.slice(),
        biome: result.biome.slice(),
        water: result.water.slice(),
        roadGraph: result.roadGraph
          ? result.roadGraph.map((entry) => [...entry] as [number, number])
          : undefined,
        settlements: result.settlements
          ? result.settlements.map((settlement) => ({ ...settlement }))
          : undefined
      };
    }
  };
}

export const tectonicFamily: GeneratorFamily = {
  id: 'tectonic-simulation',
  name: 'Tectonic Simulation',
  description:
    'Heightmaps produced by a coarse tectonic and erosion simulation, similar to early Watabou experiments but tuned for continental scales.',
  tags: ['continental', 'erosion', 'procedural'],
  variants: [
    {
      id: 'temperate-standard',
      name: 'Temperate Standard',
      description: 'Balanced sea levels with temperate climates and mixed relief.',
      parameterOverrides: {
        seaLevel: 0.48,
        elevationAmplitude: 0.9,
        warpStrength: 80,
        erosionIterations: 2,
        moistureScale: 1
      }
    },
    {
      id: 'mountainous-frontiers',
      name: 'Mountainous Frontiers',
      description: 'Lower oceans and higher amplitude yielding more dramatic mountain chains.',
      parameterOverrides: {
        seaLevel: 0.4,
        elevationAmplitude: 1.25,
        warpStrength: 120,
        erosionIterations: 3,
        moistureScale: 0.9
      }
    },
    {
      id: 'flooded-realms',
      name: 'Flooded Realms',
      description: 'High sea levels for marshy continents and wide shallow seas.',
      parameterOverrides: {
        seaLevel: 0.62,
        elevationAmplitude: 0.75,
        warpStrength: 60,
        erosionIterations: 1,
        moistureScale: 1.3
      }
    }
  ],
  parameters: [
    {
      id: 'seaLevel',
      label: 'Sea level',
      type: 'range',
      min: 0.2,
      max: 0.75,
      step: 0.01,
      defaultValue: 0.48,
      description: 'Controls how much of the terrain is submerged. '
    },
    {
      id: 'elevationAmplitude',
      label: 'Elevation amplitude',
      type: 'range',
      min: 0.4,
      max: 1.6,
      step: 0.05,
      defaultValue: 0.9,
      description: 'Scales the vertical exaggeration of tectonic uplift.'
    },
    {
      id: 'warpStrength',
      label: 'Warp strength',
      type: 'range',
      min: 0,
      max: 200,
      step: 5,
      defaultValue: 80,
      description: 'Adds lateral noise to mimic plate shear zones.'
    },
    {
      id: 'erosionIterations',
      label: 'Thermal erosion passes',
      type: 'range',
      min: 0,
      max: 8,
      step: 1,
      defaultValue: 2,
      description: 'Thermal erosion iterations to soften cliffs.'
    },
    {
      id: 'moistureScale',
      label: 'Moisture scale',
      type: 'range',
      min: 0.2,
      max: 2,
      step: 0.05,
      defaultValue: 1,
      description: 'Scales the baseline humidity before rivers are applied.'
    }
  ],
  async createRunner() {
    return createTectonicRunner();
  }
};
