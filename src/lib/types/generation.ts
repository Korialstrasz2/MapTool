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

export type GeneratorEngineId =
  | 'terrain-wasm'
  | 'fractal-highlands'
  | 'voronoi-realms'
  | 'noisy-archipelago';

export interface GeneratorOptionDefinition {
  id: string;
  label: string;
  description?: string;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
}

export interface GeneratorVariantDefinition {
  id: string;
  name: string;
  description: string;
  optionDefaults: Record<string, number>;
}

export interface GeneratorEngineDefinition {
  id: GeneratorEngineId;
  name: string;
  description: string;
  variants: GeneratorVariantDefinition[];
  options: GeneratorOptionDefinition[];
}

export interface GeneratorParameters {
  width: number;
  height: number;
  seed: number;
  generatorId: GeneratorEngineId;
  variantId: string;
  options: Record<string, number>;
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
