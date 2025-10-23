import { writable, derived } from 'svelte/store';
import type {
  GeneratorDefinition,
  GeneratorParameters,
  GeneratorResult,
  GeneratorSettings,
  WorkerStatusStage
} from '$lib/types/generation';
import {
  GENERATOR_DEFINITIONS,
  createDefaultSettings,
  formatSettingValue,
  getGeneratorDefinition,
  mergeWithDefaults
} from '$lib/config/generators';

const DEFAULT_DEFINITION = GENERATOR_DEFINITIONS[0];
const DEFAULT_SETTINGS = createDefaultSettings(DEFAULT_DEFINITION);
const settingsCache = new Map<GeneratorDefinition['id'], GeneratorSettings>([
  [DEFAULT_DEFINITION.id, DEFAULT_SETTINGS]
]);

const DEFAULT_PARAMS: GeneratorParameters = {
  width: 512,
  height: 512,
  seed: 1337,
  generatorId: DEFAULT_DEFINITION.id,
  settings: DEFAULT_SETTINGS
};

export const generatorParameters = writable<GeneratorParameters>(DEFAULT_PARAMS);
export const generatorResult = writable<GeneratorResult | null>(null);
export const isGenerating = writable(false);
export const lastDuration = writable<number | null>(null);
export const generationStatus = writable<string>('');
export const generatorDefinitions = GENERATOR_DEFINITIONS;
export const activeGeneratorDefinition = derived(generatorParameters, ($params) =>
  getGeneratorDefinition($params.generatorId)
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

export function selectGenerator(id: GeneratorDefinition['id']): void {
  generatorParameters.update((params) => {
    if (params.generatorId === id) {
      return params;
    }

    settingsCache.set(params.generatorId, params.settings);
    const definition = getGeneratorDefinition(id);
    const cached = settingsCache.get(id);
    const settings = cached ? mergeWithDefaults(definition, cached) : createDefaultSettings(definition);
    settingsCache.set(id, settings);
    return {
      ...params,
      generatorId: id,
      settings
    };
  });
}

export function updateGeneratorSetting(key: string, value: number): void {
  generatorParameters.update((params) => {
    const nextSettings = {
      ...params.settings,
      [key]: value
    };
    settingsCache.set(params.generatorId, nextSettings);
    return {
      ...params,
      settings: nextSettings
    };
  });
}

export { formatSettingValue };
