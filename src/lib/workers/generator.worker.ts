/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse, WorkerError, WorkerStatus, WorkerStatusStage } from '$lib/types/generation';
import type { TerrainWasmModule } from '$lib/wasm/terrain';
import { loadTerrainWasm } from '$lib/wasm/terrain';
import { getGeneratorDefinition, getVariantDefinition } from '$lib/generators/catalog';
import { runGenerator } from '$lib/generators/runtime';

let modulePromise: Promise<TerrainWasmModule> | null = null;
let moduleLoaded = false;

function postStatus(stage: WorkerStatusStage, message: string) {
  const status: WorkerStatus = { type: 'status', stage, message };
  ctx.postMessage(status);
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { data } = event;

  if (data.type !== 'generate') {
    return;
  }

  try {
    const params = data.params;
    const definition = getGeneratorDefinition(params.systemId);
    const variant = getVariantDefinition(params.systemId, params.variantId);

    if (params.systemId === 'terrain-wasm' && !modulePromise) {
      console.info('[MapTool][Worker] Loading terrain WebAssembly module…');
      postStatus('loading-module', 'Loading terrain engine…');
      modulePromise = loadTerrainWasm();
    }

    if (params.systemId === 'terrain-wasm') {
      const module = await modulePromise!;
      if (!moduleLoaded) {
        moduleLoaded = true;
        postStatus('module-ready', 'Terrain engine ready.');
      }
    }

    postStatus('generating', `Running ${definition.name} – ${variant.name}…`);
    console.info('[MapTool][Worker] Starting generation', {
      system: params.systemId,
      variant: params.variantId,
      seed: params.seed,
      width: params.width,
      height: params.height
    });
    const start = performance.now();
    const payload = await runGenerator(params, () => {
      if (!modulePromise) {
        modulePromise = loadTerrainWasm();
      }
      return modulePromise!;
    });
    const durationMs = performance.now() - start;
    postStatus('transferring', 'Finalizing map data…');
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

export {};
