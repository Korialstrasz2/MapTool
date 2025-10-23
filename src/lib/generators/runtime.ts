import type { GeneratorParameters, GeneratorResult } from '$lib/types/generation';
import type { TerrainWasmModule } from '$lib/wasm/terrain';
import { runTerrainWasmGenerator } from './systems/terrainWasm';
import { runVoronoiGenerator } from './systems/voronoi';
import { runTectonicGenerator } from './systems/tectonic';
import { runFractalBasinsGenerator } from './systems/fractalBasins';

export async function runGenerator(
  params: GeneratorParameters,
  loadTerrainModule: () => Promise<TerrainWasmModule>
): Promise<GeneratorResult> {
  switch (params.systemId) {
    case 'terrain-wasm': {
      const module = await loadTerrainModule();
      return runTerrainWasmGenerator(module, params);
    }
    case 'voronoi-provinces':
      return runVoronoiGenerator(params);
    case 'tectonic-plates':
      return runTectonicGenerator(params);
    case 'fractured-basins':
      return runFractalBasinsGenerator(params);
    default:
      throw new Error(`Unsupported generator system: ${params.systemId}`);
  }
}
