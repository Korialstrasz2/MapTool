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
      console.info('[MapTool][Worker] Loading terrain WebAssembly module…');
      modulePromise = loadTerrainWasm();
    }

    const module = await modulePromise;
    console.info('[MapTool][Worker] Starting generation', {
      seed: data.params.seed,
      width: data.params.width,
      height: data.params.height
    });
    const start = performance.now();
    const payload = runGenerator(module, data.params);
    const durationMs = performance.now() - start;
    console.info('[MapTool][Worker] Generation completed', {
      durationMs: Number(durationMs.toFixed(2))
    });
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
    console.error('[MapTool][Worker] Generation failed', message);
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
    heightmap: result.heightmap.slice(),
    flow: result.flow.slice(),
    moisture: result.moisture.slice(),
    temperature: result.temperature.slice(),
    biome: result.biome.slice(),
    water: result.water.slice(),
    roadGraph: result.roadGraph ? result.roadGraph.map((entry) => [...entry] as [number, number]) : undefined,
    settlements: result.settlements
      ? result.settlements.map((settlement) => ({ ...settlement }))
      : undefined
  };
}

export {};
