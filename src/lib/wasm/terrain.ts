import type { GeneratorResult } from '$lib/types/generation';

export interface TerrainWasmModule {
  generate_map(
    width: number,
    height: number,
    seed: number,
    seaLevel: number,
    elevationAmplitude: number,
    warpStrength: number,
    erosionIterations: number,
    moistureScale: number
  ): TerrainGeneration;
}

export interface TerrainGeneration extends GeneratorResult {}

let loadPromise: Promise<TerrainWasmModule> | null = null;

export async function loadTerrainWasm(): Promise<TerrainWasmModule> {
  if (!loadPromise) {
    console.info('[MapTool][WASM] Attempting to load terrain WebAssembly module.');
    loadPromise = import('../../wasm/terrain/pkg/terrain')
      .then(async (module) => {
        if ('default' in module && typeof module.default === 'function') {
          await module.default();
        }
        console.info('[MapTool][WASM] Terrain WebAssembly module initialized successfully.');
        return module as unknown as TerrainWasmModule;
      })
      .catch(async (error) => {
        console.warn('[MapTool] Falling back to JavaScript terrain generator', error);
        const fallback = await import('./terrain-fallback');
        console.info('[MapTool][WASM] Using JavaScript fallback terrain generator.');
        return fallback.default;
      });
  }

  return loadPromise;
}
