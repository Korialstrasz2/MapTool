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

export type GeneratorId = 'continental' | 'archipelago' | 'ridge-basin' | 'weitou-delta';

export type GeneratorSettings = Record<string, number>;

export interface GeneratorParameterControl {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  description?: string;
  precision?: number;
  unit?: string;
  integer?: boolean;
}

export interface GeneratorControlSection {
  id: string;
  label: string;
  description?: string;
  parameters: GeneratorParameterControl[];
}

export interface GeneratorDefinition {
  id: GeneratorId;
  name: string;
  tagline: string;
  description: string;
  statusMessage: string;
  sections: GeneratorControlSection[];
}

export interface GeneratorParameters {
  width: number;
  height: number;
  seed: number;
  generatorId: GeneratorId;
  settings: GeneratorSettings;
}

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

export interface WorkerRequest {
  type: 'generate';
  params: GeneratorParameters;
}

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
