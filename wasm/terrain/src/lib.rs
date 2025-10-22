use js_sys::{Array, Float32Array, Object, Uint8Array};
use noise::{NoiseFn, OpenSimplex};
use wasm_bindgen::prelude::*;

const REGION_SIZE: f32 = 2048.0;
const DIRECTIONS: [(i32, i32); 8] = [
    (-1, -1),
    (0, -1),
    (1, -1),
    (-1, 0),
    (1, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
];

#[derive(Clone)]
struct Settlement {
    id: u32,
    x: f32,
    y: f32,
    size: f32,
}

#[wasm_bindgen]
pub struct MapResult {
    width: u32,
    height: u32,
    heightmap: Vec<f32>,
    flow: Vec<f32>,
    moisture: Vec<f32>,
    temperature: Vec<f32>,
    biome: Vec<u8>,
    water: Vec<f32>,
    road_graph: Vec<(u32, u32)>,
    settlements: Vec<Settlement>,
}

#[wasm_bindgen]
impl MapResult {
    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn heightmap(&self) -> Float32Array {
        Float32Array::from(self.heightmap.as_slice())
    }

    pub fn flow(&self) -> Float32Array {
        Float32Array::from(self.flow.as_slice())
    }

    pub fn moisture(&self) -> Float32Array {
        Float32Array::from(self.moisture.as_slice())
    }

    pub fn temperature(&self) -> Float32Array {
        Float32Array::from(self.temperature.as_slice())
    }

    pub fn biome(&self) -> Uint8Array {
        Uint8Array::from(self.biome.as_slice())
    }

    pub fn water(&self) -> Float32Array {
        Float32Array::from(self.water.as_slice())
    }

    #[wasm_bindgen(getter = roadGraph)]
    pub fn road_graph(&self) -> Array {
        let array = Array::new();
        for (a, b) in &self.road_graph {
            let pair = Array::new();
            pair.push(&JsValue::from(*a));
            pair.push(&JsValue::from(*b));
            array.push(&pair.into());
        }
        array
    }

    pub fn settlements(&self) -> Array {
        let array = Array::new();
        for settlement in &self.settlements {
            let obj = Object::new();
            js_sys::Reflect::set(&obj, &JsValue::from("id"), &JsValue::from(settlement.id)).ok();
            js_sys::Reflect::set(&obj, &JsValue::from("x"), &JsValue::from(settlement.x)).ok();
            js_sys::Reflect::set(&obj, &JsValue::from("y"), &JsValue::from(settlement.y)).ok();
            js_sys::Reflect::set(
                &obj,
                &JsValue::from("size"),
                &JsValue::from(settlement.size),
            )
            .ok();
            array.push(&obj.into());
        }
        array
    }
}

#[wasm_bindgen]
pub fn generate_map(
    width: u32,
    height: u32,
    seed: u32,
    sea_level: f32,
    elevation_amplitude: f32,
    warp_strength: f32,
    erosion_iterations: u32,
    moisture_scale: f32,
) -> MapResult {
    let size = (width * height) as usize;
    let mut heightmap = vec![0.0f32; size];
    let mut moisture = vec![0.0f32; size];
    let mut temperature = vec![0.0f32; size];

    let base_noise = OpenSimplex::new(seed);
    let warp_noise = OpenSimplex::new(seed.wrapping_add(13));
    let moisture_noise = OpenSimplex::new(seed.wrapping_add(97));

    let width_f = width as f32;
    let height_f = height as f32;

    for y in 0..height {
        for x in 0..width {
            let nx = (x as f32 / width_f) * 2.0 - 1.0;
            let ny = (y as f32 / height_f) * 2.0 - 1.0;
            let index = (y * width + x) as usize;

            let warp = warp_noise.get([nx as f64 * 1.5, ny as f64 * 1.5]) as f32;
            let warped_x = nx + warp * (warp_strength / 400.0);
            let warped_y = ny + warp * (warp_strength / 400.0);

            let mut elevation = 0.0f32;
            let mut frequency = 1.2f32;
            let mut amplitude = 1.0f32;
            for _octave in 0..5 {
                let sample = base_noise.get([
                    warped_x as f64 * frequency as f64,
                    warped_y as f64 * frequency as f64,
                ]) as f32;
                elevation += sample * amplitude;
                frequency *= 2.0;
                amplitude *= 0.5;
            }

            elevation = elevation / 2.5;
            let distance = (nx * nx + ny * ny).sqrt();
            let continentality = (1.0 - distance.powf(1.6)).clamp(0.0, 1.0);
            let mut value =
                (elevation * elevation_amplitude + continentality * 0.65) / (1.0 + 0.65);
            value = value.clamp(-1.0, 1.0);
            let normalized = ((value + 1.0) * 0.5).powf(1.18);
            heightmap[index] = normalized;

            let moist_sample =
                moisture_noise.get([warped_x as f64 * 1.8, warped_y as f64 * 1.8]) as f32;
            moisture[index] = ((moist_sample * 0.5 + 0.5) * moisture_scale).clamp(0.0, 1.0);

            let latitude = (y as f32 / height_f) - 0.5;
            let altitude_penalty = ((normalized - sea_level).max(0.0) * 1.5).min(1.0);
            let base_temperature = (1.0 - latitude.abs() * 1.8).clamp(0.0, 1.0);
            temperature[index] = (base_temperature - altitude_penalty).clamp(0.0, 1.0);
        }
    }

    apply_thermal_erosion(&mut heightmap, width, height, erosion_iterations);

    let (flow, water) = build_flow_map(&heightmap, width, height, sea_level);
    enhance_moisture(&mut moisture, &water, &flow, moisture_scale);
    let biome = classify_biomes(
        &heightmap,
        &water,
        &temperature,
        &moisture,
        width,
        height,
        sea_level,
    );

    let settlements = place_settlements(
        &heightmap, &water, &moisture, width, height, sea_level, seed,
    );
    let road_graph = build_roads(&settlements);

    MapResult {
        width,
        height,
        heightmap,
        flow,
        moisture,
        temperature,
        biome,
        water,
        road_graph,
        settlements,
    }
}

fn apply_thermal_erosion(heightmap: &mut [f32], width: u32, height: u32, iterations: u32) {
    let width_i = width as usize;
    let height_i = height as usize;
    for _ in 0..iterations {
        let mut scratch = heightmap.to_vec();
        for y in 1..(height_i - 1) {
            for x in 1..(width_i - 1) {
                let index = y * width_i + x;
                let center = heightmap[index];
                let mut total = center;
                let mut count = 1.0f32;
                for (dx, dy) in DIRECTIONS {
                    let nx = (x as i32 + dx) as usize;
                    let ny = (y as i32 + dy) as usize;
                    let n_index = ny * width_i + nx;
                    let neighbor = heightmap[n_index];
                    if (center - neighbor) > 0.03 {
                        total += neighbor + (center - neighbor) * 0.5;
                        count += 1.0;
                    }
                }
                scratch[index] = total / count;
            }
        }
        heightmap.copy_from_slice(&scratch);
    }
}

fn build_flow_map(
    heightmap: &[f32],
    width: u32,
    height: u32,
    sea_level: f32,
) -> (Vec<f32>, Vec<f32>) {
    let width_i = width as usize;
    let height_i = height as usize;
    let size = width_i * height_i;
    let mut downslope = vec![None; size];

    for y in 0..height_i {
        for x in 0..width_i {
            let index = y * width_i + x;
            let current = heightmap[index];
            let mut lowest = current;
            let mut lowest_index: Option<usize> = None;

            for (dx, dy) in DIRECTIONS {
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if nx < 0 || ny < 0 || nx >= width as i32 || ny >= height as i32 {
                    continue;
                }
                let n_index = ny as usize * width_i + nx as usize;
                let neighbor = heightmap[n_index];
                if neighbor < lowest {
                    lowest = neighbor;
                    lowest_index = Some(n_index);
                }
            }

            downslope[index] = lowest_index;
        }
    }

    let mut order: Vec<usize> = (0..size).collect();
    order.sort_by(|a, b| heightmap[*b].partial_cmp(&heightmap[*a]).unwrap());

    let mut flow = vec![1.0f32; size];
    for &cell in &order {
        if let Some(target) = downslope[cell] {
            flow[target] += flow[cell];
        }
    }

    let max_flow = flow.iter().fold(0.0f32, |acc, &v| acc.max(v));
    let mut water = vec![0.0f32; size];

    for (index, value) in heightmap.iter().enumerate() {
        if *value <= sea_level {
            water[index] = 1.0;
        } else {
            let runoff = (flow[index] / (max_flow + 1.0)).powf(0.4);
            if runoff > 0.3 {
                water[index] = runoff;
            }
        }
    }

    (flow, water)
}

fn enhance_moisture(moisture: &mut [f32], water: &[f32], flow: &[f32], moisture_scale: f32) {
    let max_flow = flow.iter().fold(0.0f32, |acc, &v| acc.max(v));
    for (index, value) in moisture.iter_mut().enumerate() {
        let water_bonus = (water[index] * 0.7).min(0.7);
        let flow_bonus = ((flow[index] / (max_flow + 1.0)) * 1.8).min(0.8);
        *value = (*value + water_bonus + flow_bonus) / (1.0 + moisture_scale * 0.5);
        *value = value.clamp(0.0, 1.0);
    }
}

fn classify_biomes(
    heightmap: &[f32],
    water: &[f32],
    temperature: &[f32],
    moisture: &[f32],
    width: u32,
    height: u32,
    sea_level: f32,
) -> Vec<u8> {
    let mut biomes = vec![0u8; (width * height) as usize];
    for i in 0..biomes.len() {
        let elevation = heightmap[i];
        if elevation <= sea_level - 0.02 {
            biomes[i] = 0; // ocean
            continue;
        }

        if water[i] > 0.6 {
            biomes[i] = 1; // lake
            continue;
        }

        if elevation > 0.82 {
            biomes[i] = 9; // alpine
            continue;
        }

        let temp = temperature[i];
        let moist = moisture[i];

        let biome = if temp < 0.2 {
            2 // tundra
        } else if temp < 0.35 {
            if moist > 0.4 {
                3
            } else {
                2
            }
        } else if temp < 0.55 {
            if moist > 0.55 {
                4
            } else if moist > 0.35 {
                5
            } else {
                8
            }
        } else if temp < 0.75 {
            if moist > 0.65 {
                4
            } else if moist > 0.4 {
                5
            } else {
                7
            }
        } else {
            if moist > 0.7 {
                6
            } else if moist > 0.45 {
                7
            } else {
                8
            }
        };

        biomes[i] = biome;
    }
    biomes
}

fn place_settlements(
    heightmap: &[f32],
    water: &[f32],
    moisture: &[f32],
    width: u32,
    height: u32,
    sea_level: f32,
    seed: u32,
) -> Vec<Settlement> {
    let mut candidates: Vec<(usize, f32)> = Vec::new();
    let width_i = width as usize;
    let height_i = height as usize;

    for y in 2..(height_i - 2) {
        for x in 2..(width_i - 2) {
            let index = y * width_i + x;
            let elevation = heightmap[index];
            if elevation <= sea_level + 0.02 {
                continue;
            }
            if water[index] > 0.2 {
                continue;
            }
            let flatness = local_flatness(heightmap, width_i, height_i, x, y);
            if flatness > 0.08 {
                continue;
            }

            let score = moisture[index] * 0.6 + (1.0 - flatness) * 0.3 + elevation * 0.1;
            if score > 0.35 {
                candidates.push((index, score));
            }
        }
    }

    candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut rng = SimpleRng::new(seed.wrapping_mul(747));
    let mut settlements: Vec<Settlement> = Vec::new();

    for (index, score) in candidates.into_iter().take(200) {
        let x = (index % width_i) as f32;
        let y = (index / width_i) as f32;
        let world_x = (x / width as f32) * REGION_SIZE;
        let world_y = (y / height as f32) * REGION_SIZE;

        if settlements.iter().any(|s| {
            let dx = s.x - world_x;
            let dy = s.y - world_y;
            (dx * dx + dy * dy).sqrt() < 120.0
        }) {
            continue;
        }

        let jitter_x = (rng.next_f32() - 0.5) * 25.0;
        let jitter_y = (rng.next_f32() - 0.5) * 25.0;
        let size = (score * 6.0).clamp(1.2, 6.5);
        settlements.push(Settlement {
            id: settlements.len() as u32,
            x: world_x + jitter_x,
            y: world_y + jitter_y,
            size,
        });

        if settlements.len() >= 16 {
            break;
        }
    }

    settlements
}

fn build_roads(settlements: &[Settlement]) -> Vec<(u32, u32)> {
    let count = settlements.len();
    if count < 2 {
        return Vec::new();
    }

    let mut connected = vec![false; count];
    let mut edges: Vec<(u32, u32)> = Vec::new();
    connected[0] = true;

    while edges.len() < count - 1 {
        let mut best_edge: Option<(usize, usize, f32)> = None;
        for (i, a) in settlements.iter().enumerate() {
            if !connected[i] {
                continue;
            }
            for (j, b) in settlements.iter().enumerate() {
                if connected[j] {
                    continue;
                }
                let dx = a.x - b.x;
                let dy = a.y - b.y;
                let distance = (dx * dx + dy * dy).sqrt();
                if let Some((_bi, _bj, best)) = best_edge {
                    if distance < best {
                        best_edge = Some((i, j, distance));
                    }
                } else {
                    best_edge = Some((i, j, distance));
                }
            }
        }

        if let Some((a, b, _)) = best_edge {
            connected[b] = true;
            edges.push((a as u32, b as u32));
        } else {
            break;
        }
    }

    edges
}

fn local_flatness(heightmap: &[f32], width: usize, height: usize, x: usize, y: usize) -> f32 {
    let center = heightmap[y * width + x];
    let mut variance = 0.0f32;
    let mut count = 0.0f32;
    for (dx, dy) in DIRECTIONS {
        let nx = (x as i32 + dx).clamp(0, (width - 1) as i32) as usize;
        let ny = (y as i32 + dy).clamp(0, (height - 1) as i32) as usize;
        let diff = (center - heightmap[ny * width + nx]).abs();
        variance += diff;
        count += 1.0;
    }
    variance / count
}

struct SimpleRng {
    state: u32,
}

impl SimpleRng {
    fn new(seed: u32) -> Self {
        Self { state: seed | 1 }
    }

    fn next_u32(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        x
    }

    fn next_f32(&mut self) -> f32 {
        let value = self.next_u32();
        (value as f64 / u32::MAX as f64) as f32
    }
}
