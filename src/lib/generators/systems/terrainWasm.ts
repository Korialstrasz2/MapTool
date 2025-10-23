import type { GeneratorParameters } from '$lib/types/generation';
import type { TerrainWasmModule } from '$lib/wasm/terrain';

export function runTerrainWasmGenerator(
  module: TerrainWasmModule,
  params: GeneratorParameters
) {
  const { width, height, seed } = params;
  const values = params.values;
  const seaLevel = values.seaLevel ?? 0.5;
  const elevationAmplitude = values.elevationAmplitude ?? 1.0;
  const warpStrength = values.warpStrength ?? 80;
  const erosionIterations = Math.round(values.erosionIterations ?? 2);
  const moistureScale = values.moistureScale ?? 1.0;

  const result = module.generate_map(
    width,
    height,
    seed >>> 0,
    seaLevel,
    elevationAmplitude,
    warpStrength,
    erosionIterations,
    moistureScale
  );

  return {
    width: result.width,
    height: result.height,
    heightmap: result.heightmap.slice(),
    flow: result.flow.slice(),
    moisture: result.moisture.slice(),
    temperature: result.temperature.slice(),
    biome: result.biome.slice(),
    water: result.water.slice(),
    roadGraph: result.roadGraph
      ? result.roadGraph.map((entry) => [...entry] as [number, number])
      : undefined,
    settlements: result.settlements
      ? result.settlements.map((settlement) => ({ ...settlement }))
      : undefined
  };
}
