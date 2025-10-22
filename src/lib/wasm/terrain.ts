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

type WasmModule = TerrainWasmModule & { default?: () => Promise<unknown> };

const wasmModuleLoaders = import.meta.glob<WasmModule>(
  '../../../wasm/terrain/pkg/terrain.js'
);

let loadPromise: Promise<TerrainWasmModule> | null = null;

async function loadFallback(): Promise<TerrainWasmModule> {
  const fallback = await import('./terrain-fallback');
  console.info('[MapTool][WASM] Using JavaScript fallback terrain generator.');
  return fallback.default;
}

export async function loadTerrainWasm(): Promise<TerrainWasmModule> {
  if (!loadPromise) {
    console.info('[MapTool][WASM] Attempting to load terrain WebAssembly module.');

    const loader = wasmModuleLoaders['../../../wasm/terrain/pkg/terrain.js'];

    if (!loader) {
      console.warn('[MapTool][WASM] wasm-pack output not found. Falling back to JavaScript terrain generator.');
      loadPromise = loadFallback();
      return loadPromise;
    }

    loadPromise = loader()
      .then(async (module) => {
        const wasmModule = module as WasmModule;
        if (typeof wasmModule.default === 'function') {
          await wasmModule.default();
        }
        console.info('[MapTool][WASM] Terrain WebAssembly module initialized successfully.');
        return wasmModule;
      })
      .catch(async (error) => {
        console.warn('[MapTool] Falling back to JavaScript terrain generator', error);
        return loadFallback();
      });
  }

  return loadPromise;
}
