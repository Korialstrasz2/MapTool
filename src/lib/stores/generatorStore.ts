import { writable, derived } from 'svelte/store';
import type { GeneratorParameters, GeneratorResult } from '$lib/types/generation';

const DEFAULT_PARAMS: GeneratorParameters = {
  width: 512,
  height: 512,
  seed: 1337,
  seaLevel: 0.48,
  elevationAmplitude: 0.9,
  warpStrength: 80,
  erosionIterations: 2,
  moistureScale: 1.0
};

export const generatorParameters = writable<GeneratorParameters>(DEFAULT_PARAMS);
export const generatorResult = writable<GeneratorResult | null>(null);
export const isGenerating = writable(false);
export const lastDuration = writable<number | null>(null);
export const generationStatus = writable<string>('');

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
