/// <reference lib="webworker" />

import type {
  GeneratorParameters,
  GeneratorSettings,
  WorkerRequest,
  WorkerResponse,
  WorkerError,
  WorkerStatus,
  WorkerStatusStage
} from '$lib/types/generation';
import type { TerrainWasmModule } from '$lib/wasm/terrain';
import { loadTerrainWasm } from '$lib/wasm/terrain';
import { getGeneratorDefinition, mergeWithDefaults } from '$lib/config/generators';
import {
  generateArchipelago,
  generateRidgeBasin,
  generateWeitouDelta
} from './custom-generators';

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
    const definition = getGeneratorDefinition(params.generatorId);
    const settings = mergeWithDefaults(definition, params.settings);

    let module: TerrainWasmModule | null = null;

    if (params.generatorId === 'continental') {
      if (!modulePromise) {
        console.info('[MapTool][Worker] Loading terrain WebAssembly module…');
        postStatus('loading-module', 'Loading terrain engine…');
        modulePromise = loadTerrainWasm();
      }

      module = await modulePromise;

      if (!moduleLoaded) {
        moduleLoaded = true;
        postStatus('module-ready', 'Terrain engine ready.');
      }
    }

    postStatus('generating', definition.statusMessage);
    console.info('[MapTool][Worker] Starting generation', {
      generator: params.generatorId,
      seed: params.seed,
      width: params.width,
      height: params.height
    });
    const start = performance.now();
    const payload = runGenerator(module, params, settings);
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

function runGenerator(
  module: TerrainWasmModule | null,
  params: GeneratorParameters,
  settings: GeneratorSettings
) {
  switch (params.generatorId) {
    case 'continental':
      if (!module) {
        throw new Error('Terrain engine not available for continental generator.');
      }
      return runContinentalGenerator(module, params, settings);
    case 'archipelago':
      return generateArchipelago(params, settings);
    case 'ridge-basin':
      return generateRidgeBasin(params, settings);
    case 'weitou-delta':
      return generateWeitouDelta(params, settings);
    default:
      throw new Error(`Unknown generator: ${params.generatorId}`);
  }
}

function runContinentalGenerator(
  module: TerrainWasmModule,
  params: GeneratorParameters,
  settings: GeneratorSettings
) {
  const seaLevel = settings.seaLevel ?? 0.48;
  const elevationAmplitude = settings.elevationAmplitude ?? 0.9;
  const warpStrength = settings.warpStrength ?? 80;
  const erosionIterations = Math.round(settings.erosionIterations ?? 2);
  const moistureScale = settings.moistureScale ?? 1.0;

  const result = module.generate_map(
    params.width,
    params.height,
    params.seed >>> 0,
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
