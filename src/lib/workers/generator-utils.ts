const BIOME_MAP: Array<{ elevation: number; moisture: number; temperature: number; index: number }> = [
  { elevation: 0.2, moisture: 0.5, temperature: 1, index: 0 },
  { elevation: 0.25, moisture: 1, temperature: 1, index: 1 },
  { elevation: 0.4, moisture: 0.4, temperature: 0.25, index: 2 },
  { elevation: 0.6, moisture: 0.7, temperature: 0.35, index: 3 },
  { elevation: 0.6, moisture: 0.85, temperature: 0.5, index: 4 },
  { elevation: 0.65, moisture: 0.6, temperature: 0.7, index: 5 },
  { elevation: 0.7, moisture: 0.95, temperature: 0.85, index: 6 },
  { elevation: 0.75, moisture: 0.6, temperature: 0.9, index: 7 },
  { elevation: 0.75, moisture: 0.3, temperature: 1, index: 8 },
  { elevation: 0.95, moisture: 0.5, temperature: 0.4, index: 9 }
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function pickBiome(elevation: number, moisture: number, temperature: number): number {
  if (elevation < 0.18) {
    return 0;
  }
  if (elevation < 0.24) {
    return 1;
  }

  let best = BIOME_MAP[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of BIOME_MAP) {
    const dElevation = Math.abs(candidate.elevation - elevation);
    const dMoisture = Math.abs(candidate.moisture - moisture);
    const dTemperature = Math.abs(candidate.temperature - temperature);
    const score = dElevation * 2 + dMoisture + dTemperature;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best.index;
}

export function computeSlopeFlow(heightmap: Float32Array, width: number, height: number): Float32Array {
  const flow = new Float32Array(width * height);
  const neighbors = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const baseHeight = heightmap[index];

      let slope = 0;
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const neighborIndex = ny * width + nx;
        const diff = baseHeight - heightmap[neighborIndex];
        if (diff > slope) {
          slope = diff;
        }
      }

      flow[index] = Math.max(0, slope);
    }
  }

  return flow;
}

export function normalizeArray(buffer: Float32Array, min = 0, max = 1): void {
  let smallest = Number.POSITIVE_INFINITY;
  let largest = Number.NEGATIVE_INFINITY;

  for (const value of buffer) {
    if (value < smallest) smallest = value;
    if (value > largest) largest = value;
  }

  const range = largest - smallest;
  if (range <= 0) {
    return;
  }

  for (let i = 0; i < buffer.length; i += 1) {
    const t = (buffer[i] - smallest) / range;
    buffer[i] = lerp(min, max, t);
  }
}
