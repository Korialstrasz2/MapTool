import { writable, derived, get } from 'svelte/store';
import type { GeneratorResult, WorkerStatusStage } from '$lib/types/generation';
import type { GeneratorFamily } from '$lib/types/generatorCatalog';
import { GENERATOR_FAMILIES } from '$lib/generators';

interface BaseParameters {
  width: number;
  height: number;
  seed: number;
}

const DEFAULT_BASE: BaseParameters = {
  width: 512,
  height: 512,
  seed: 1337
};

function parameterDefaults(
  family: GeneratorFamily,
  variantId: string
): Record<string, number> {
  const defaults: Record<string, number> = {};

  for (const definition of family.parameters) {
    defaults[definition.id] = definition.defaultValue;
  }

  const variant = family.variants.find((entry) => entry.id === variantId);

  if (variant?.parameterOverrides) {
    for (const [key, value] of Object.entries(variant.parameterOverrides)) {
      defaults[key] = value;
    }
  }

  return defaults;
}

const FIRST_FAMILY = GENERATOR_FAMILIES[0];
const FIRST_VARIANT = FIRST_FAMILY.variants[0];

export const baseParameters = writable<BaseParameters>({ ...DEFAULT_BASE });
export const activeFamilyId = writable<string>(FIRST_FAMILY.id);
export const activeVariantId = writable<string>(FIRST_VARIANT.id);
export const generatorParameters = writable<Record<string, number>>(
  parameterDefaults(FIRST_FAMILY, FIRST_VARIANT.id)
);
export const generatorResult = writable<GeneratorResult | null>(null);
export const isGenerating = writable(false);
export const lastDuration = writable<number | null>(null);
export const generationStatus = writable<string>('');

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
  baseParameters.update((params) => ({
    ...params,
    seed: (Math.random() * 1_000_000) >>> 0
  }));
}

export function setActiveFamily(familyId: string): void {
  const family = GENERATOR_FAMILIES.find((entry) => entry.id === familyId);
  if (!family) {
    return;
  }

  activeFamilyId.set(familyId);
  const variant = family.variants[0];
  activeVariantId.set(variant.id);
  generatorParameters.set(parameterDefaults(family, variant.id));
}

export function setActiveVariant(variantId: string): void {
  const family = get(currentFamily);
  if (!family) {
    return;
  }

  const variant = family.variants.find((entry) => entry.id === variantId);
  if (!variant) {
    return;
  }

  activeVariantId.set(variant.id);
  generatorParameters.set(parameterDefaults(family, variant.id));
}

export const generatorFamilies = GENERATOR_FAMILIES;

export const currentFamily = derived(activeFamilyId, ($id) =>
  GENERATOR_FAMILIES.find((family) => family.id === $id) ?? FIRST_FAMILY
);

export const currentVariant = derived(
  [currentFamily, activeVariantId],
  ([$family, $variantId]) => $family.variants.find((variant) => variant.id === $variantId) ?? $family.variants[0]
);

export const currentParameters = derived(generatorParameters, ($parameters) => $parameters);

export const parameterDefinitions = derived(currentFamily, ($family) => $family.parameters);

export function updateGeneratorParameter(id: string, value: number): void {
  generatorParameters.update((params) => ({
    ...params,
    [id]: value
  }));
}

export function updateBaseParameter(key: keyof BaseParameters, value: number): void {
  baseParameters.update((params) => ({
    ...params,
    [key]: value
  }));
}

export const generatorRequestPayload = derived(
  [baseParameters, currentFamily, currentVariant, generatorParameters],
  ([$base, $family, $variant, $parameters]) => ({
    familyId: $family.id,
    variantId: $variant.id,
    width: $base.width,
    height: $base.height,
    seed: $base.seed,
    parameters: $parameters
  })
);
