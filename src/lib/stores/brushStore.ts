import { writable, get } from 'svelte/store';
import type { GeneratorResult } from '$lib/types/generation';
import {
  buildFlowMap,
  classifyBiomes,
  computeTemperatureField,
  enhanceMoisture
} from '$lib/utils/terrainProcessing';
import { generatorResult, generatorParameters } from './generatorStore';

export type BrushMode = 'raise' | 'lower' | 'flatten' | 'water';

export interface BrushSettings {
  size: number;
  strength: number;
  mode: BrushMode;
  targetHeight: number;
}

const DEFAULT_SETTINGS: BrushSettings = {
  size: 32,
  strength: 0.05,
  mode: 'raise',
  targetHeight: 0.55
};

export const brushSettings = writable<BrushSettings>({ ...DEFAULT_SETTINGS });

export function setBrushMode(mode: BrushMode): void {
  brushSettings.update((settings) => ({ ...settings, mode }));
}

export function setBrushSize(size: number): void {
  brushSettings.update((settings) => ({ ...settings, size }));
}

export function setBrushStrength(strength: number): void {
  brushSettings.update((settings) => ({ ...settings, strength }));
}

export function setBrushTargetHeight(height: number): void {
  brushSettings.update((settings) => ({ ...settings, targetHeight: height }));
}

export function applyBrushStroke(
  mapX: number,
  mapY: number,
  scaleX: number,
  scaleY: number
): GeneratorResult | null {
  const result = get(generatorResult);
  if (!result) {
    return null;
  }

  const parameters = get(generatorParameters);
  const settings = get(brushSettings);

  const seaLevel = typeof parameters.seaLevel === 'number' ? parameters.seaLevel : 0.5;
  const moistureScale = typeof parameters.moistureScale === 'number' ? parameters.moistureScale : 1;

  const radiusX = settings.size * scaleX;
  const radiusY = settings.size * scaleY;
  const radius = Math.max(radiusX, radiusY);

  const { width, height, heightmap } = result;
  let minX = Math.max(0, Math.floor(mapX - radius));
  let maxX = Math.min(width - 1, Math.ceil(mapX + radius));
  let minY = Math.max(0, Math.floor(mapY - radius));
  let maxY = Math.min(height - 1, Math.ceil(mapY + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x - mapX) / (radiusX || 1);
      const dy = (y - mapY) / (radiusY || 1);
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 1) {
        continue;
      }

      const falloff = 1 - distance * distance;
      const delta = settings.strength * falloff;
      const index = y * width + x;
      const current = heightmap[index];

      switch (settings.mode) {
        case 'raise':
          heightmap[index] = Math.min(1, current + delta);
          break;
        case 'lower':
          heightmap[index] = Math.max(0, current - delta);
          break;
        case 'flatten':
          heightmap[index] = current + (settings.targetHeight - current) * delta;
          break;
        case 'water':
          heightmap[index] = Math.max(0, seaLevel - delta * 2);
          break;
      }
    }
  }

  const { flow, water } = buildFlowMap(result.heightmap, width, height, seaLevel);
  const moisture = result.moisture.slice();
  enhanceMoisture(moisture, water, flow, moistureScale);
  const temperature = computeTemperatureField(width, height, result.heightmap, seaLevel);
  const biome = classifyBiomes(result.heightmap, water, temperature, moisture, width, height, seaLevel);

  const updated: GeneratorResult = {
    ...result,
    heightmap: result.heightmap.slice(),
    flow,
    water,
    moisture,
    temperature,
    biome
  };

  generatorResult.set(updated);
  return updated;
}
