/// <reference lib="webworker" />

import type {
  GeneratorEngineId,
  GeneratorParameters,
  WorkerRequest,
  WorkerResponse,
  WorkerError,
  WorkerStatus,
  WorkerStatusStage
} from '$lib/types/generation';
import { loadTerrainWasm } from '$lib/wasm/terrain';
import { runGenerator } from '$lib/generators/runtime';
import { getEngineDefinition, getVariantDefinition } from '$lib/generators/catalog';

function postStatus(stage: WorkerStatusStage, message: string) {
  const status: WorkerStatus = { type: 'status', stage, message };
  ctx.postMessage(status);
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const moduleReady = new Map<GeneratorEngineId, boolean>();

function describeRun(params: GeneratorParameters): string {
  const engine = getEngineDefinition(params.generatorId);
  const variant = getVariantDefinition(engine, params.variantId);
  if (engine && variant) {
    return `${engine.name} · ${variant.name}`;
  }
  return engine?.name ?? params.generatorId;
}

async function ensureResources(params: GeneratorParameters): Promise<void> {
  if (params.generatorId === 'terrain-wasm' && !moduleReady.get(params.generatorId)) {
    postStatus('loading-module', 'Loading terrain engine…');
    await loadTerrainWasm();
    moduleReady.set(params.generatorId, true);
    postStatus('module-ready', 'Terrain engine ready.');
  }
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { data } = event;

  if (data.type !== 'generate') {
    return;
  }

  try {
    const { params } = data;
    await ensureResources(params);

    const description = describeRun(params);
    postStatus('generating', `Running ${description}…`);
    console.info('[MapTool][Worker] Starting generation', {
      seed: params.seed,
      width: params.width,
      height: params.height,
      generatorId: params.generatorId,
      variantId: params.variantId
    });

    const start = performance.now();
    const payload = await runGenerator(params);
    const durationMs = performance.now() - start;
    postStatus('transferring', 'Finalizing map data…');
    console.info('[MapTool][Worker] Generation completed', {
      durationMs: Number(durationMs.toFixed(2)),
      generatorId: params.generatorId,
      variantId: params.variantId
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
