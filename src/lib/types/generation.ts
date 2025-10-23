export type LayerKind =
  | 'height'
  | 'water'
  | 'biome'
  | 'roads'
  | 'settlements'
  | 'landcover';

export type BiomeId =
  | 'ocean'
  | 'lake'
  | 'tundra'
  | 'boreal-forest'
  | 'temperate-forest'
  | 'temperate-grassland'
  | 'tropical-forest'
  | 'savanna'
  | 'desert'
  | 'alpine';

export interface GeneratorResult {
  width: number;
  height: number;
  heightmap: Float32Array;
  flow: Float32Array;
  moisture: Float32Array;
  temperature: Float32Array;
  biome: Uint8Array;
  water: Float32Array;
  roadGraph?: Array<[number, number]>;
  settlements?: Array<{ id: number; x: number; y: number; size: number }>;
}

import type { GeneratorSelectionPayload } from './generatorCatalog';

export type WorkerRequest =
  | { type: 'generate'; payload: GeneratorSelectionPayload }
  | { type: 'prime-family'; familyId: string };

export interface WorkerResponse {
  type: 'result';
  payload: GeneratorResult;
  durationMs: number;
}

export interface WorkerError {
  type: 'error';
  message: string;
}

export type WorkerStatusStage =
  | 'loading-module'
  | 'module-ready'
  | 'generating'
  | 'transferring';

export interface WorkerStatus {
  type: 'status';
  stage: WorkerStatusStage;
  message: string;
}

export type WorkerMessage = WorkerResponse | WorkerError | WorkerStatus;
