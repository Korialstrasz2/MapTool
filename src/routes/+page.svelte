<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    generatorParameters,
    generatorResult,
    isGenerating,
    lastDuration,
    summary,
    randomizeSeed
  } from '$stores/generatorStore';
  import type { WorkerResponse, WorkerError } from '$lib/types/generation';
  import type { GeneratorParameters } from '$lib/types/generation';
  import { MapRenderer } from '$lib/render/MapRenderer';

  let canvasContainer: HTMLDivElement | null = null;
  let worker: Worker | null = null;
  let renderer: MapRenderer | null = null;
  let unsubscribe: (() => void) | null = null;
  let errorMessage: string | null = null;

  const canUseBrowser = typeof window !== 'undefined';

  onMount(() => {
    if (!canUseBrowser || !canvasContainer) {
      return;
    }

    worker = new Worker(new URL('$workers/generator.worker.ts', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = (event: MessageEvent<WorkerResponse | WorkerError>) => {
      const message = event.data;
      if (message.type === 'error') {
        isGenerating.set(false);
        errorMessage = message.message;
        console.error('[MapTool] Generation error reported by worker', message.message);
        return;
      }

      generatorResult.set(message.payload);
      lastDuration.set(message.durationMs);
      isGenerating.set(false);
      errorMessage = null;
      console.info('[MapTool] Generation finished', {
        durationMs: Number(message.durationMs.toFixed(2)),
        summary: {
          width: message.payload.width,
          height: message.payload.height
        }
      });
    };

    renderer = new MapRenderer(canvasContainer);

    unsubscribe = generatorResult.subscribe((result) => {
      if (result && renderer) {
        renderer.render(result);
      }
    });

    triggerGeneration();
  });

  onDestroy(() => {
    unsubscribe?.();
    worker?.terminate();
    renderer?.destroy();
  });

  function triggerGeneration() {
    if (!worker) return;
    const params = get(generatorParameters);
    isGenerating.set(true);
    console.info('[MapTool] Triggering generation', {
      seed: params.seed,
      width: params.width,
      height: params.height
    });
    worker.postMessage({ type: 'generate', params });
  }

  function updateParam(key: keyof GeneratorParameters, value: number) {
    generatorParameters.update((params) => ({
      ...params,
      [key]: value
    }));
  }
</script>

<svelte:window on:keydown={(event) => {
  if (event.key === 'g' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    triggerGeneration();
  }
}} />

<div class="app-shell">
  <div class="canvas-panel" bind:this={canvasContainer}>
    {#if errorMessage}
      <div class="error-banner">{errorMessage}</div>
    {/if}
    {#if $isGenerating}
      <div class="loading">Generating…</div>
    {/if}
  </div>
  <aside class="control-panel">
    <header>
      <h1>Regional Map Generator</h1>
      <p>Deterministic seeds, reproducible results. Offline-ready.</p>
    </header>

    <section>
      <label>
        Seed
        <input
          type="number"
          bind:value={$generatorParameters.seed}
          min="0"
          max="4294967295"
        />
      </label>
      <div class="buttons">
        <button type="button" on:click={triggerGeneration} disabled={$isGenerating}>
          Generate
        </button>
        <button type="button" on:click={randomizeSeed} disabled={$isGenerating}>
          Randomize Seed
        </button>
      </div>
      {#if $lastDuration}
        <p class="meta">Last generation: {$lastDuration.toFixed(0)} ms</p>
      {/if}
    </section>

    <section>
      <h2>Terrain</h2>
      <label>
        Sea level
        <input
          type="range"
          min="0.2"
          max="0.7"
          step="0.01"
          bind:value={$generatorParameters.seaLevel}
          on:change={(event) => updateParam('seaLevel', parseFloat(event.currentTarget.value))}
        />
        <span>{$generatorParameters.seaLevel.toFixed(2)}</span>
      </label>
      <label>
        Elevation amplitude
        <input
          type="range"
          min="0.4"
          max="1.5"
          step="0.05"
          bind:value={$generatorParameters.elevationAmplitude}
          on:change={(event) =>
            updateParam('elevationAmplitude', parseFloat(event.currentTarget.value))}
        />
        <span>{$generatorParameters.elevationAmplitude.toFixed(2)}</span>
      </label>
      <label>
        Warp strength
        <input
          type="range"
          min="0"
          max="200"
          step="5"
          bind:value={$generatorParameters.warpStrength}
          on:change={(event) => updateParam('warpStrength', parseFloat(event.currentTarget.value))}
        />
        <span>{$generatorParameters.warpStrength.toFixed(0)}</span>
      </label>
      <label>
        Moisture scale
        <input
          type="range"
          min="0.2"
          max="2"
          step="0.05"
          bind:value={$generatorParameters.moistureScale}
          on:change={(event) => updateParam('moistureScale', parseFloat(event.currentTarget.value))}
        />
        <span>{$generatorParameters.moistureScale.toFixed(2)}</span>
      </label>
    </section>

    <section>
      <h2>Erosion</h2>
      <label>
        Iterations
        <input
          type="range"
          min="0"
          max="8"
          step="1"
          bind:value={$generatorParameters.erosionIterations}
          on:change={(event) =>
            updateParam('erosionIterations', parseInt(event.currentTarget.value, 10))}
        />
        <span>{$generatorParameters.erosionIterations}</span>
      </label>
    </section>

    <section>
      <h2>Summary</h2>
      {#if $summary}
        <ul>
          <li>Coastline coverage: {($summary.coastlineRatio * 100).toFixed(1)}%</li>
          <li>Settlements: {$summary.settlements}</li>
          <li>Roads: {$summary.roads}</li>
        </ul>
      {:else}
        <p>Generate a map to see stats.</p>
      {/if}
    </section>
  </aside>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', system-ui, sans-serif;
    background: #0b172a;
    color: #f1f5f9;
  }

  .app-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    height: 100vh;
  }

  .canvas-panel {
    position: relative;
    background: radial-gradient(circle at 25% 25%, #1f2a44, #0b172a 70%);
    overflow: hidden;
  }

  .canvas-panel canvas {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  .loading {
    position: absolute;
    top: 1rem;
    left: 1rem;
    padding: 0.5rem 1rem;
    background: rgba(11, 23, 42, 0.8);
    border-radius: 0.5rem;
    backdrop-filter: blur(6px);
  }

  .error-banner {
    position: absolute;
    top: 1rem;
    right: 1rem;
    padding: 0.75rem 1rem;
    background: rgba(180, 40, 40, 0.85);
    border-radius: 0.5rem;
    font-weight: 600;
  }

  .control-panel {
    padding: 1.5rem;
    background: #111f33;
    overflow-y: auto;
    border-left: 1px solid rgba(148, 163, 184, 0.1);
  }

  header h1 {
    margin: 0 0 0.5rem;
    font-size: 1.4rem;
  }

  header p {
    margin: 0 0 1.5rem;
    color: rgba(226, 232, 240, 0.7);
  }

  section {
    margin-bottom: 1.75rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  input[type='number'] {
    padding: 0.5rem;
    border-radius: 0.4rem;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.6);
    color: inherit;
  }

  input[type='range'] {
    width: 100%;
  }

  button {
    appearance: none;
    border: none;
    border-radius: 0.5rem;
    padding: 0.6rem 1rem;
    font-weight: 600;
    cursor: pointer;
    background: linear-gradient(120deg, #2563eb, #38bdf8);
    color: #0b172a;
    transition: opacity 0.15s ease;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .buttons {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  .meta {
    color: rgba(226, 232, 240, 0.6);
    margin-top: 0.5rem;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.4rem;
  }

  li {
    background: rgba(15, 23, 42, 0.55);
    padding: 0.65rem 0.75rem;
    border-radius: 0.5rem;
  }
</style>
