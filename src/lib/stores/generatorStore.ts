import { writable, derived } from 'svelte/store';
import type {
  GeneratorParameters,
  GeneratorResult,
  WorkerStatusStage
} from '$lib/types/generation';
import {
  GENERATOR_ENGINES,
  getDefaultParameters,
  getEngineDefinition,
  getVariantDefinition,
  resolveOptionValue
} from '$lib/generators/catalog';

const { engine: defaultEngine, variant: defaultVariant, options: defaultOptions } = getDefaultParameters();

const DEFAULT_PARAMS: GeneratorParameters = {
  width: 512,
  height: 512,
  seed: 1337,
  generatorId: defaultEngine.id,
  variantId: defaultVariant.id,
  options: defaultOptions
};

export const generatorParameters = writable<GeneratorParameters>(DEFAULT_PARAMS);
export const generatorResult = writable<GeneratorResult | null>(null);
export const isGenerating = writable(false);
export const lastDuration = writable<number | null>(null);
export const generationStatus = writable<string>('');
export const availableGenerators = GENERATOR_ENGINES;

export const selectedGenerator = derived(generatorParameters, ($params) =>
  getEngineDefinition($params.generatorId)
);

export const selectedVariant = derived([generatorParameters, selectedGenerator], ([$params, $engine]) =>
  getVariantDefinition($engine, $params.variantId)
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

export function setGenerator(engineId: string): void {
  const engine = getEngineDefinition(engineId);
  if (!engine) {
    return;
  }
  const variant = engine.variants[0];
  generatorParameters.update((params) => ({
    ...params,
    generatorId: engine.id,
    variantId: variant.id,
    options: resolveOptionValue(engine, variant, {})
  }));
}

export function setVariant(variantId: string): void {
  generatorParameters.update((params) => {
    const engine = getEngineDefinition(params.generatorId);
    if (!engine) {
      return params;
    }
    const variant = getVariantDefinition(engine, variantId);
    if (!variant) {
      return params;
    }
    return {
      ...params,
      variantId: variant.id,
      options: resolveOptionValue(engine, variant, {})
    };
  });
}

export function updateOption(optionId: string, value: number): void {
  generatorParameters.update((params) => {
    const engine = getEngineDefinition(params.generatorId);
    if (!engine) {
      return params;
    }
    const option = engine.options.find((candidate) => candidate.id === optionId);
    if (!option) {
      return params;
    }
    const clampedValue = Math.min(option.max, Math.max(option.min, value));
    return {
      ...params,
      options: {
        ...params.options,
        [optionId]: clampedValue
      }
    };
  });
}
