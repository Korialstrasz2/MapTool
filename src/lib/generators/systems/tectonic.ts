import type { GeneratorParameters, GeneratorResult } from '$lib/types/generation';
import {
  blurField,
  clamp,
  createRng,
  finalizeResult,
  fractalNoise,
  smoothStep,
  valueNoise
} from './common';

interface Plate {
  x: number;
  y: number;
  radius: number;
  orientation: number;
  strength: number;
  moisture: number;
  twist: number;
}

export function runTectonicGenerator(params: GeneratorParameters): GeneratorResult {
  const { width, height, seed, values } = params;
  const seaLevel = values.seaLevel ?? 0.48;
  const plateCount = Math.max(3, Math.round(values.plateCount ?? 6));
  const upliftStrength = clamp(values.upliftStrength ?? 1.2, 0.3, 3.5);
  const depressionStrength = clamp(values.depressionStrength ?? 0.8, 0.1, 3.5);
  const faultBlur = clamp(values.faultBlur ?? 0.24, 0.03, 0.6);
  const moistureGradient = clamp(values.moistureGradient ?? 0, -1, 1);

  const rng = createRng(seed, 'tectonic');
  const plates: Plate[] = Array.from({ length: plateCount }, (_, index) => {
    const isUplift = index % 2 === 0;
    const radius = 0.18 + rng() * 0.35;
    const orientation = rng() * Math.PI * 2;
    const twist = (rng() - 0.5) * 2;
    return {
      x: clamp(rng(), 0.05, 0.95),
      y: clamp(rng(), 0.05, 0.95),
      radius,
      orientation,
      strength:
        (isUplift ? upliftStrength : -depressionStrength) * (0.65 + rng() * 0.7),
      moisture: 0.35 + rng() * 0.55,
      twist
    };
  });

  const sampleWidth = Math.max(80, Math.floor(width / 4));
  const sampleHeight = Math.max(80, Math.floor(height / 4));
  const coarseHeight = new Float32Array(sampleWidth * sampleHeight);
  const coarseMoisture = new Float32Array(sampleWidth * sampleHeight);

  for (let sy = 0; sy < sampleHeight; sy += 1) {
    const ny = sy / (sampleHeight - 1);
    for (let sx = 0; sx < sampleWidth; sx += 1) {
      const nx = sx / (sampleWidth - 1);
      let heightValue = 0;
      let moistureValue = 0;
      let ridgeAccumulator = 0;

      for (const plate of plates) {
        const dx = nx - plate.x;
        const dy = ny - plate.y;
        const distance = Math.hypot(dx, dy);
        const normalizedDistance = distance / (plate.radius + faultBlur * 0.5);
        const envelope = smoothStep(clamp(1 - normalizedDistance, 0, 1));
        if (envelope <= 0) {
          continue;
        }

        const alongFault = Math.cos(plate.orientation) * dx + Math.sin(plate.orientation) * dy;
        const shear = Math.tanh(alongFault / (faultBlur + 0.05));
        const twistTerm = Math.sin((dx * dy + plate.twist) * Math.PI);
        heightValue += plate.strength * envelope * (shear + twistTerm * 0.25);
        ridgeAccumulator += Math.abs(shear) * envelope;
        moistureValue += plate.moisture * envelope * (1 - Math.abs(shear));
      }

      const tectonicNoise = fractalNoise(nx, ny, 3, 3.1, 0.5, seed + 211);
      const ridgeNoise = valueNoise(nx, ny, 6.8, seed + 403);
      heightValue += (tectonicNoise - 0.5) * 1.2;
      heightValue += ridgeAccumulator * 0.45;
      heightValue += (ridgeNoise - 0.5) * 0.35;

      const edgeDistance = Math.min(nx, ny, 1 - nx, 1 - ny);
      heightValue -= clamp(0.18 - edgeDistance, 0, 0.18) * 4.8;

      moistureValue += ridgeAccumulator * 0.15;
      moistureValue += (tectonicNoise - 0.5) * 0.35;
      moistureValue += (0.5 - Math.abs(nx - 0.5)) * 0.25;
      moistureValue += moistureGradient * (ny - 0.5);

      const index = sy * sampleWidth + sx;
      coarseHeight[index] = heightValue;
      coarseMoisture[index] = moistureValue;
    }
  }

  blurField(coarseHeight, sampleWidth, sampleHeight, 2, 1);
  blurField(coarseMoisture, sampleWidth, sampleHeight, 1, 1);

  const heightField = new Float32Array(width * height);
  const moistureField = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const ny = y / (height - 1);
    const sy = ny * (sampleHeight - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(sampleHeight - 1, y0 + 1);
    const ty = smoothStep(sy - y0);
    for (let x = 0; x < width; x += 1) {
      const nx = x / (width - 1);
      const sx = nx * (sampleWidth - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(sampleWidth - 1, x0 + 1);
      const tx = smoothStep(sx - x0);
      const idx00 = y0 * sampleWidth + x0;
      const idx10 = y0 * sampleWidth + x1;
      const idx01 = y1 * sampleWidth + x0;
      const idx11 = y1 * sampleWidth + x1;
      const top = coarseHeight[idx00] * (1 - tx) + coarseHeight[idx10] * tx;
      const bottom = coarseHeight[idx01] * (1 - tx) + coarseHeight[idx11] * tx;
      const heightValue = top * (1 - ty) + bottom * ty;
      const mTop = coarseMoisture[idx00] * (1 - tx) + coarseMoisture[idx10] * tx;
      const mBottom = coarseMoisture[idx01] * (1 - tx) + coarseMoisture[idx11] * tx;
      const moistureValue = mTop * (1 - ty) + mBottom * ty;

      const cellNoise = fractalNoise(nx, ny, 2, 14, 0.4, seed + 509);
      const index = y * width + x;
      heightField[index] = heightValue + (cellNoise - 0.5) * 0.12;
      moistureField[index] = moistureValue + (cellNoise - 0.5) * 0.2;
    }
  }

  return finalizeResult(width, height, heightField, moistureField, seaLevel);
}
