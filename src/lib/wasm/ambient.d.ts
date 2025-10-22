declare module '../../wasm/terrain/pkg/terrain' {
  export interface TerrainResult {
    width: number;
    height: number;
    heightmap: Float32Array;
    flow: Float32Array;
    moisture: Float32Array;
    temperature: Float32Array;
    biome: Uint8Array;
    water: Float32Array;
    roadGraph: Array<[number, number]>;
    settlements: Array<{ id: number; x: number; y: number; size: number }>;
  }

  export default function init(moduleOrPath?: WebAssembly.Module | BufferSource | string): Promise<any>;
  export function generate_map(
    width: number,
    height: number,
    seed: number,
    seaLevel: number,
    elevationAmplitude: number,
    warpStrength: number,
    erosionIterations: number,
    moistureScale: number
  ): TerrainResult;
}
