/// <reference lib="webworker" />

import type {
  WorkerRequest,
  WorkerResponse,
  WorkerError,
  WorkerStatus,
  WorkerStatusStage
} from '$lib/types/generation';
import type { GeneratorRunner } from '$lib/types/generatorCatalog';
import { FAMILY_MAP } from '$lib/generators';

const runnerCache = new Map<string, Promise<GeneratorRunner>>();

function postStatus(stage: WorkerStatusStage, message: string) {
  const status: WorkerStatus = { type: 'status', stage, message };
  ctx.postMessage(status);
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { data } = event;

  if (data.type === 'prime-family') {
    void warmFamily(data.familyId);
    return;
  }

  if (data.type !== 'generate') {
    return;
  }

  const { payload } = data;
  const family = FAMILY_MAP.get(payload.familyId);

  if (!family) {
    const message = `Unknown generator family: ${payload.familyId}`;
    console.error('[MapTool][Worker] ' + message);
    const response: WorkerError = { type: 'error', message };
    ctx.postMessage(response);
    return;
  }

  const variant = family.variants.find((entry) => entry.id === payload.variantId);

  try {
    const runner = await warmFamily(payload.familyId, family);

    postStatus('generating', `Generating with ${family.name}${variant ? ` – ${variant.name}` : ''}…`);
    console.info('[MapTool][Worker] Starting generation', {
      family: family.id,
      variant: payload.variantId,
      seed: payload.seed,
      width: payload.width,
      height: payload.height
    });

    const start = performance.now();
    const result = await runner.generate({
      width: payload.width,
      height: payload.height,
      seed: payload.seed,
      parameters: payload.parameters,
      variantId: payload.variantId
    });
    const durationMs = performance.now() - start;

    postStatus('transferring', 'Packaging terrain layers…');

    const response: WorkerResponse = {
      type: 'result',
      payload: result,
      durationMs
    };

    const transferables: Array<ArrayBuffer> = [
      result.heightmap.buffer,
      result.flow.buffer,
      result.moisture.buffer,
      result.temperature.buffer,
      result.biome.buffer,
      result.water.buffer
    ];

    ctx.postMessage(response, transferables);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error';
    console.error('[MapTool][Worker] Generation failed', error);
    const response: WorkerError = { type: 'error', message };
    ctx.postMessage(response);
  }
};

async function warmFamily(id: string, family = FAMILY_MAP.get(id)) {
  if (!family) {
    return Promise.reject(new Error(`Unknown generator family: ${id}`));
  }

  let promise = runnerCache.get(id);

  if (!promise) {
    console.info('[MapTool][Worker] Preparing generator family', { id });
    postStatus('loading-module', `Preparing ${family.name}…`);
    promise = family.createRunner().then((runner) => {
      postStatus('module-ready', `${family.name} ready.`);
      return runner;
    });
    runnerCache.set(id, promise);
  }

  return promise;
}

export {};
