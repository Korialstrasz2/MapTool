# MapTool

Procedural regional map generator built with SvelteKit, PixiJS, and Rust-compiled WebAssembly.

## Stack

- **Frontend**: SvelteKit + TypeScript with Svelte stores for state management.
- **Rendering**: PixiJS renders layered terrain, biomes, and water using an orthographic canvas.
- **Generation**: Deterministic terrain, moisture, biomes, rivers, and settlements are generated in Rust and compiled to WebAssembly.
- **Workers**: A dedicated Web Worker keeps generation off the UI thread.
- **Storage**: Dexie/IndexedDB foundations are in place for future offline persistence. Project export will use a single JSON file.

## Getting Started

```bash
npm install
npm run wasm
npm run dev
```

`npm run wasm` compiles the Rust generator via `wasm-pack` into `wasm/terrain/pkg`.

## Project Layout

- `src/routes/+page.svelte` – main UI shell with generator controls and preview canvas.
- `src/lib/render/MapRenderer.ts` – PixiJS renderer for layered map visualisation.
- `src/lib/workers/generator.worker.ts` – Web Worker that orchestrates wasm generation.
- `wasm/terrain/src/lib.rs` – deterministic procedural generation implemented in Rust.

## Roadmap

- Implement mask-based editing tools (brushes, river painting, road editing).
- Add tiled regeneration and caching for large regions.
- Provide export pipeline for PNG, SVG, GeoJSON, and heightmap formats.
- Integrate Dexie persistence with autosave and undo/redo snapshots.
