/// <reference lib="webworker" />

import type {
  GeneratorParameters,
  WorkerRequest,
  WorkerResponse,
  WorkerError,
  WorkerStatus,
  WorkerStatusStage
} from '$lib/types/generation';
import { GENERATOR_LABELS } from '$lib/generation/registry';
import { runGenerator } from '$lib/generation/systems';
function postStatus(stage: WorkerStatusStage, message: string) {
  const status: WorkerStatus = { type: 'status', stage, message };
  ctx.postMessage(status);
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { data } = event;

  if (data.type !== 'generate') {
    return;
  }

  try {
    const params: GeneratorParameters = data.params;
    const label = GENERATOR_LABELS[params.generatorType] ?? 'Custom terrain';

    postStatus('loading-module', `Configuring ${label.toLowerCase()} generator…`);
    postStatus('module-ready', `${label} parameters ready.`);
    postStatus('generating', `Synthesizing ${label.toLowerCase()} terrain…`);
    console.info('[MapTool][Worker] Starting generation', {
      seed: params.seed,
      width: params.width,
      height: params.height,
      generatorType: params.generatorType
    });
    const start = performance.now();
    const payload = runGenerator(params);
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
