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
    loadPromise = import('../../wasm/terrain/pkg/terrain').then(async (module) => {
      if ('default' in module && typeof module.default === 'function') {
        await module.default();
      }
      return module as unknown as TerrainWasmModule;
    });
  }

  return loadPromise;
}
