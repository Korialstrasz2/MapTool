/// <reference lib="webworker" />

import type {
  GeneratorParameters,
  WorkerRequest,
  WorkerResponse,
  WorkerError
} from '$lib/types/generation';
import type { TerrainWasmModule } from '$lib/wasm/terrain';
import { loadTerrainWasm } from '$lib/wasm/terrain';

let modulePromise: Promise<TerrainWasmModule> | null = null;

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { data } = event;

  if (data.type !== 'generate') {
    return;
  }

  try {
    if (!modulePromise) {
      modulePromise = loadTerrainWasm();
    }

    const module = await modulePromise;
    const start = performance.now();
    const payload = runGenerator(module, data.params);
    const durationMs = performance.now() - start;
    const response: WorkerResponse = { type: 'result', payload, durationMs };
    ctx.postMessage(response, [
      payload.heightmap.buffer,
      payload.flow.buffer,
      payload.moisture.buffer,
      payload.temperature.buffer,
      payload.biome.buffer,
      payload.water.buffer
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error';
    const response: WorkerError = { type: 'error', message };
    ctx.postMessage(response);
  }
};

function runGenerator(module: TerrainWasmModule, params: GeneratorParameters) {
  const { width, height, seed, seaLevel, elevationAmplitude, warpStrength, erosionIterations, moistureScale } = params;
  const result = module.generate_map(
    width,
    height,
    seed >>> 0,
    seaLevel,
    elevationAmplitude,
    warpStrength,
    erosionIterations,
    moistureScale
  );

  return {
    width: result.width,
    height: result.height,
    heightmap: result.heightmap,
    flow: result.flow,
    moisture: result.moisture,
    temperature: result.temperature,
    biome: result.biome,
    water: result.water,
    roadGraph: result.roadGraph,
    settlements: result.settlements
  };
}

export {};
