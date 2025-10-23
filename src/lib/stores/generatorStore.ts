import { writable, derived, get } from 'svelte/store';
import type {
  GeneratorParameters,
  GeneratorResult,
  WorkerStatusStage,
  GeneratorSystemId
} from '$lib/types/generation';
import {
  createDefaultParameters,
  generatorCatalog,
  getGeneratorDefinition,
  getVariantDefinition
} from '$lib/generators/catalog';

const DEFAULT_PARAMS: GeneratorParameters = createDefaultParameters();

export const generatorParameters = writable<GeneratorParameters>(DEFAULT_PARAMS);
export const generatorResult = writable<GeneratorResult | null>(null);
export const isGenerating = writable(false);
export const lastDuration = writable<number | null>(null);
export const generationStatus = writable<string>('');

export const currentGeneratorDefinition = derived(generatorParameters, ($params) =>
  getGeneratorDefinition($params.systemId)
);

export const currentVariantDefinition = derived(generatorParameters, ($params) =>
  getVariantDefinition($params.systemId, $params.variantId)
);

export type GenerationTimelineStage =
  | 'requesting'
  | 'renderer-ready'
  | WorkerStatusStage
  | 'rendering'
  | 'ready'
  | 'error';

export interface GenerationTimelineEntry {
  id: number;
  stage: GenerationTimelineStage;
  message: string;
  timestamp: number;
  elapsedMs: number;
  sinceStartMs: number;
  details?: Record<string, unknown>;
}

export const generationTimeline = writable<GenerationTimelineEntry[]>([]);

let timelineCounter = 0;
let firstTimestamp: number | null = null;
let lastTimestamp: number | null = null;

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function resetGenerationTimeline(): void {
  generationTimeline.set([]);
  timelineCounter = 0;
  firstTimestamp = null;
  lastTimestamp = null;
}

export function appendGenerationTimeline(
  stage: GenerationTimelineStage,
  message: string,
  details?: Record<string, unknown>
): void {
  const timestamp = nowMs();

  if (firstTimestamp === null) {
    firstTimestamp = timestamp;
  }

  const elapsedMs = lastTimestamp === null ? 0 : Math.max(0, timestamp - lastTimestamp);
  const sinceStartMs = firstTimestamp === null ? 0 : Math.max(0, timestamp - firstTimestamp);

  const entry: GenerationTimelineEntry = {
    id: ++timelineCounter,
    stage,
    message,
    timestamp,
    elapsedMs,
    sinceStartMs,
    details
  };

  lastTimestamp = timestamp;

  generationTimeline.update((entries) => [...entries, entry]);
}

export const summary = derived(generatorResult, ($result) => {
  if (!$result) {
    return null;
  }

  const wetCells = $result.water.reduce((acc, value) => (value > 0.5 ? acc + 1 : acc), 0);
  const totalCells = $result.width * $result.height;
  const coastline = wetCells / totalCells;

  return {
    coastlineRatio: coastline,
    settlements: $result.settlements?.length ?? 0,
    roads: $result.roadGraph?.length ?? 0
  };
});

export function randomizeSeed(): void {
  generatorParameters.update((params) => ({
    ...params,
    seed: (Math.random() * 1_000_000) >>> 0
  }));
}

export function setGeneratorSystem(systemId: GeneratorSystemId): void {
  const definition = getGeneratorDefinition(systemId);
  const variant = definition.variants[0];
  generatorParameters.update((params) => ({
    ...params,
    systemId,
    variantId: variant.id,
    values: { ...variant.defaults }
  }));
}

export function setGeneratorVariant(variantId: string): void {
  const params = get(generatorParameters);
  const definition = getGeneratorDefinition(params.systemId);
  const variant = definition.variants.find((entry) => entry.id === variantId);
  if (!variant) {
    console.warn('[MapTool] Attempted to select unknown generator variant.', {
      system: params.systemId,
      variantId
    });
    return;
  }
  generatorParameters.update((current) => ({
    ...current,
    variantId,
    values: { ...variant.defaults }
  }));
}

export function updateGeneratorValue(optionId: string, value: number): void {
  generatorParameters.update((params) => ({
    ...params,
    values: {
      ...params.values,
      [optionId]: value
    }
  }));
}

export { generatorCatalog };
