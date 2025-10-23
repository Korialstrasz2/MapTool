<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    generatorParameters,
    generatorResult,
    isGenerating,
    lastDuration,
    summary,
    randomizeSeed,
    generationStatus,
    generationTimeline,
    resetGenerationTimeline,
    appendGenerationTimeline
  } from '$stores/generatorStore';
  import type {
    GenerationTimelineEntry,
    GenerationTimelineStage
  } from '$stores/generatorStore';
  import type { WorkerMessage } from '$lib/types/generation';
  import type { GeneratorParameters, GeneratorType } from '$lib/types/generation';
  import type { GeneratorMetadata } from '$lib/generation/registry';
  import { GENERATOR_METADATA, GENERATOR_LABELS } from '$lib/generation/registry';
  import { MapRenderer } from '$lib/render/MapRenderer';

  let canvasContainer: HTMLDivElement | null = null;
  let worker: Worker | null = null;
  let renderer: MapRenderer | null = null;
  let unsubscribe: (() => void) | null = null;
  let errorMessage: string | null = null;
  let rendererReady = false;
  let timelineEntries: GenerationTimelineEntry[] = [];
  let latestTimelineEntry: GenerationTimelineEntry | undefined;

  const canUseBrowser = typeof window !== 'undefined';

  const STAGE_LABELS: Record<GenerationTimelineStage, string> = {
    requesting: 'Dispatching',
    'renderer-ready': 'Renderer ready',
    'loading-module': 'Configuring generator',
    'module-ready': 'Generator ready',
    generating: 'Synthesizing terrain',
    transferring: 'Finalizing data',
    rendering: 'Rendering map',
    ready: 'Complete',
    error: 'Error'
  };

  const DETAIL_LABELS: Record<string, string> = {
    seed: 'Seed',
    width: 'Width',
    height: 'Height',
    generatorDurationMs: 'Generator time',
    generatorType: 'Generator',
    featureScale: 'Feature scale',
    riverStrength: 'River strength',
    temperatureBias: 'Temperature bias'
  };

  function formatDuration(ms: number): string {
    if (ms <= 0) {
      return '0 ms';
    }
    if (ms < 1000) {
      return `${Math.round(ms)} ms`;
    }
    if (ms < 60_000) {
      return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
    }
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
  }

  function formatDetailKey(key: string): string {
    if (DETAIL_LABELS[key]) {
      return DETAIL_LABELS[key];
    }
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatDetailValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return '';
      }
      if (Math.abs(value) >= 1000) {
        return value.toLocaleString();
      }
      if (Number.isInteger(value)) {
        return value.toString();
      }
      return value.toFixed(2);
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    return String(value);
  }

  function normalizedDetails(details?: Record<string, unknown>): Array<{ key: string; value: string }> {
    if (!details) {
      return [];
    }
    return Object.entries(details)
      .map(([key, value]) => ({ key: formatDetailKey(key), value: formatDetailValue(value) }))
      .filter((detail) => detail.value !== '');
  }

  function stageClass(stage: GenerationTimelineStage): string {
    return `stage-${stage}`;
  }

  $: timelineEntries = $generationTimeline;
  $: latestTimelineEntry = timelineEntries.at(-1);
  let activeGenerator: GeneratorMetadata = GENERATOR_METADATA[0];
  $:
    activeGenerator =
      GENERATOR_METADATA.find((entry) => entry.type === $generatorParameters.generatorType) ??
      GENERATOR_METADATA[0];

  onMount(() => {
    if (!canUseBrowser || !canvasContainer) {
      console.warn('[MapTool] Skipping UI initialization; browser APIs unavailable.');
      return;
    }

    console.info('[MapTool] Starting UI initialization.');

    worker = new Worker(new URL('$workers/generator.worker.ts', import.meta.url), {
      type: 'module'
    });

    console.info('[MapTool] Background worker started.');

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === 'status') {
        generationStatus.set(message.message);
        appendGenerationTimeline(message.stage, message.message);
        console.info('[MapTool] Status update from worker', message);
        return;
      }
      if (message.type === 'error') {
        isGenerating.set(false);
        errorMessage = message.message;
        generationStatus.set('Generation failed.');
        appendGenerationTimeline('error', message.message);
        console.error('[MapTool] Generation error reported by worker', message.message);
        return;
      }

      console.info('[MapTool] Generation result received from worker', {
        width: message.payload.width,
        height: message.payload.height,
        durationMs: Number(message.durationMs.toFixed(2))
      });

      appendGenerationTimeline('rendering', 'Rendering terrain preview…', {
        width: message.payload.width,
        height: message.payload.height
      });
      generationStatus.set('Rendering map…');

      try {
        generatorResult.set(message.payload);
        renderer?.render(message.payload);
        appendGenerationTimeline('ready', `Map rendered in ${message.durationMs.toFixed(0)} ms.`, {
          generatorDurationMs: Number(message.durationMs.toFixed(2))
        });
        lastDuration.set(message.durationMs);
        isGenerating.set(false);
        generationStatus.set(`Map ready in ${message.durationMs.toFixed(0)} ms.`);
        errorMessage = null;
        console.info('[MapTool] Generation finished', {
          durationMs: Number(message.durationMs.toFixed(2)),
          summary: {
            width: message.payload.width,
            height: message.payload.height
          }
        });
      } catch (error) {
        isGenerating.set(false);
        const messageText =
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while rendering the map.';
        appendGenerationTimeline('error', messageText);
        errorMessage = 'Failed to draw the generated map. Check the console for details.';
        generationStatus.set('Rendering failed.');
        console.error('[MapTool] Failed to render generator output', error);
      }
    };

    worker.onerror = (event) => {
      console.error('[MapTool] Worker runtime error', event);
    };

    worker.onmessageerror = (event) => {
      console.error('[MapTool] Worker message deserialization error', event);
    };

    const initializeRenderer = async () => {
      try {
        renderer = await MapRenderer.create(canvasContainer);
        rendererReady = true;
        generationStatus.set('Renderer ready.');
        console.info('[MapTool] Renderer initialized.', {
          width: canvasContainer.clientWidth,
          height: canvasContainer.clientHeight
        });
      } catch (error) {
        errorMessage = 'Failed to initialize graphics renderer.';
        generationStatus.set('Failed to initialize graphics renderer.');
        appendGenerationTimeline('error', 'Renderer failed to initialize.');
        console.error('[MapTool] Renderer initialization failed', error);
        return;
      }

      unsubscribe = generatorResult.subscribe((result) => {
        if (!result) {
          console.debug('[MapTool] Awaiting generator output.');
          return;
        }

        console.info('[MapTool] Rendering new generator result.', {
          width: result.width,
          height: result.height
        });
      });

      console.info('[MapTool] Subscribed to generator result updates.');

      triggerGeneration();
    };

    void initializeRenderer();
  });

  onDestroy(() => {
    console.info('[MapTool] Cleaning up UI resources.');
    unsubscribe?.();
    unsubscribe = null;
    worker?.terminate();
    worker = null;
    renderer?.destroy();
    renderer = null;
    rendererReady = false;
    generationStatus.set('');
  });

  function triggerGeneration() {
    if (!worker) {
      console.warn('[MapTool] Cannot trigger generation; worker not ready.');
      generationStatus.set('Generator is still starting…');
      resetGenerationTimeline();
      appendGenerationTimeline('error', 'Generator worker is not ready yet.');
      return;
    }
    if (!rendererReady) {
      console.warn('[MapTool] Trigger requested before renderer finished initialization.');
    }
    const params = get(generatorParameters);
    resetGenerationTimeline();
    if (rendererReady && canvasContainer) {
      appendGenerationTimeline('renderer-ready', 'Renderer ready.', {
        width: canvasContainer.clientWidth,
        height: canvasContainer.clientHeight
      });
    }
    appendGenerationTimeline('requesting', 'Dispatching parameters to worker…', {
      seed: params.seed,
      width: params.width,
      height: params.height,
      generatorType: GENERATOR_LABELS[params.generatorType] ?? params.generatorType,
      featureScale: params.featureScale,
      riverStrength: params.riverStrength,
      temperatureBias: params.temperatureBias
    });
    isGenerating.set(true);
    generationStatus.set('Preparing generation…');
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
    console.info('[MapTool] Updated generator parameter', { key, value });
  }

  function updateGeneratorType(type: GeneratorType) {
    generatorParameters.update((params) => ({
      ...params,
      generatorType: type
    }));
    console.info('[MapTool] Switched generator', { type });
  }

  function formatSigned(value: number, decimals = 2): string {
    const fixed = value.toFixed(decimals);
    return value >= 0 ? `+${fixed}` : fixed;
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
    {#if $generationStatus}
      <div class:active={$isGenerating} class="status-banner">
        {#if $isGenerating}
          <span class="spinner" aria-hidden="true"></span>
        {/if}
        <span>{$generationStatus}</span>
      </div>
    {/if}
    <div class="status-feed" aria-live="polite">
      <div class="status-feed__header">
        <strong>Generation timeline</strong>
        {#if latestTimelineEntry}
          <span class={`status-feed__badge ${stageClass(latestTimelineEntry.stage)}`}>
            {STAGE_LABELS[latestTimelineEntry.stage]}
          </span>
        {/if}
      </div>
      {#if timelineEntries.length === 0}
        <p class="status-feed__placeholder">Awaiting generation request…</p>
      {:else}
        <ol>
          {#each timelineEntries as entry (entry.id)}
            <li class:active={latestTimelineEntry && entry.id === latestTimelineEntry.id}>
              <div class="timeline-row">
                <span class={`stage-pill ${stageClass(entry.stage)}`}>
                  {STAGE_LABELS[entry.stage]}
                </span>
                <div class="timeline-timing">
                  {#if entry.elapsedMs > 0}
                    <span class="delta">+{formatDuration(entry.elapsedMs)}</span>
                  {/if}
                  <span class="since">T+{formatDuration(entry.sinceStartMs)}</span>
                </div>
              </div>
              <p>{entry.message}</p>
              {#each normalizedDetails(entry.details) as detail (detail.key)}
                <div class="timeline-detail">
                  <span class="detail-key">{detail.key}</span>
                  <span class="detail-value">{detail.value}</span>
                </div>
              {/each}
            </li>
          {/each}
        </ol>
      {/if}
    </div>
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

    <section class="generator-select">
      <h2>Generator system</h2>
      <label>
        System
        <select
          value={$generatorParameters.generatorType}
          on:change={(event) => updateGeneratorType(event.currentTarget.value as GeneratorType)}
          disabled={$isGenerating}
        >
          {#each GENERATOR_METADATA as generator}
            <option value={generator.type}>{generator.label}</option>
          {/each}
        </select>
      </label>
      <p class="meta">{activeGenerator.description}</p>
      <p class="generator-detail">{activeGenerator.longDescription}</p>
    </section>

    <section>
      <h2>Terrain structure</h2>
      <label>
        Sea level
        <input
          type="range"
          min="0.15"
          max="0.85"
          step="0.01"
          bind:value={$generatorParameters.seaLevel}
          on:change={(event) => updateParam('seaLevel', parseFloat(event.currentTarget.value))}
        />
        <span>{$generatorParameters.seaLevel.toFixed(2)}</span>
      </label>
      <label>
        Feature scale
        <input
          type="range"
          min="0.4"
          max="3"
          step="0.05"
          bind:value={$generatorParameters.featureScale}
          on:change={(event) => updateParam('featureScale', parseFloat(event.currentTarget.value))}
        />
        <span>{$generatorParameters.featureScale.toFixed(2)}</span>
      </label>
      <label>
        Elevation amplitude
        <input
          type="range"
          min="0.3"
          max="2"
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
          max="240"
          step="5"
          bind:value={$generatorParameters.warpStrength}
          on:change={(event) => updateParam('warpStrength', parseFloat(event.currentTarget.value))}
        />
        <span>{$generatorParameters.warpStrength.toFixed(0)}</span>
      </label>
      <label>
        Terrain smoothing
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
      <h2>Hydrology &amp; climate</h2>
      <label>
        River strength
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          bind:value={$generatorParameters.riverStrength}
          on:change={(event) => updateParam('riverStrength', parseFloat(event.currentTarget.value))}
        />
        <span>{$generatorParameters.riverStrength.toFixed(2)}</span>
      </label>
      <label>
        Moisture scale
        <input
          type="range"
          min="0.2"
          max="2.5"
          step="0.05"
          bind:value={$generatorParameters.moistureScale}
          on:change={(event) => updateParam('moistureScale', parseFloat(event.currentTarget.value))}
        />
        <span>{$generatorParameters.moistureScale.toFixed(2)}</span>
      </label>
      <label>
        Temperature bias
        <input
          type="range"
          min="-0.5"
          max="0.5"
          step="0.02"
          bind:value={$generatorParameters.temperatureBias}
          on:change={(event) =>
            updateParam('temperatureBias', parseFloat(event.currentTarget.value))}
        />
        <span>{formatSigned($generatorParameters.temperatureBias)}</span>
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

  .status-banner {
    position: absolute;
    top: 1rem;
    left: 1rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(11, 23, 42, 0.8);
    border-radius: 0.5rem;
    backdrop-filter: blur(6px);
    border: 1px solid rgba(148, 163, 184, 0.25);
    box-shadow: 0 12px 24px rgba(8, 15, 35, 0.25);
  }

  .status-banner.active {
    border-color: rgba(56, 189, 248, 0.6);
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border-radius: 9999px;
    border: 2px solid rgba(148, 163, 184, 0.35);
    border-top-color: #38bdf8;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
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

  .status-feed {
    position: absolute;
    left: 1rem;
    bottom: 1rem;
    width: min(340px, calc(100% - 2rem));
    max-height: calc(100% - 5.5rem);
    padding: 1rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.15);
    background: rgba(11, 23, 42, 0.78);
    backdrop-filter: blur(6px);
    box-shadow: 0 16px 32px rgba(8, 15, 35, 0.35);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow: hidden;
  }

  .status-feed__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.9);
  }

  .status-feed__badge,
  .stage-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.7rem;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
  }

  .status-feed__badge {
    font-size: 0.65rem;
    padding: 0.15rem 0.6rem;
  }

  .status-feed ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
    max-height: calc(100% - 2.5rem);
    scrollbar-width: thin;
  }

  .status-feed ol::-webkit-scrollbar {
    width: 6px;
  }

  .status-feed ol::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.25);
    border-radius: 9999px;
  }

  .status-feed li {
    border-radius: 0.65rem;
    border: 1px solid rgba(148, 163, 184, 0.12);
    padding: 0.75rem;
    background: rgba(15, 23, 42, 0.55);
    box-shadow: inset 0 0 0 1px rgba(30, 41, 59, 0.3);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: border-color 120ms ease, background 120ms ease;
  }

  .status-feed li.active {
    border-color: rgba(56, 189, 248, 0.5);
    background: rgba(14, 116, 144, 0.25);
  }

  .status-feed p {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.9);
  }

  .status-feed__placeholder {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.9);
  }

  .timeline-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .timeline-timing {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.7rem;
    color: rgba(191, 219, 254, 0.85);
  }

  .timeline-timing .delta {
    color: rgba(248, 250, 252, 0.85);
  }

  .timeline-detail {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: rgba(203, 213, 225, 0.9);
  }

  .timeline-detail .detail-key {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .timeline-detail .detail-value {
    font-variant-numeric: tabular-nums;
  }

  .stage-pill.stage-requesting,
  .status-feed__badge.stage-requesting {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.35);
  }

  .stage-pill.stage-renderer-ready,
  .status-feed__badge.stage-renderer-ready,
  .stage-pill.stage-ready,
  .status-feed__badge.stage-ready {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.35);
  }

  .stage-pill.stage-loading-module,
  .status-feed__badge.stage-loading-module {
    background: rgba(168, 85, 247, 0.2);
    border-color: rgba(168, 85, 247, 0.35);
  }

  .stage-pill.stage-module-ready,
  .status-feed__badge.stage-module-ready {
    background: rgba(16, 185, 129, 0.2);
    border-color: rgba(16, 185, 129, 0.35);
  }

  .stage-pill.stage-generating,
  .status-feed__badge.stage-generating {
    background: rgba(245, 158, 11, 0.22);
    border-color: rgba(245, 158, 11, 0.38);
  }

  .stage-pill.stage-transferring,
  .status-feed__badge.stage-transferring {
    background: rgba(129, 140, 248, 0.22);
    border-color: rgba(99, 102, 241, 0.38);
  }

  .stage-pill.stage-rendering,
  .status-feed__badge.stage-rendering {
    background: rgba(14, 165, 233, 0.24);
    border-color: rgba(14, 165, 233, 0.4);
  }

  .stage-pill.stage-error,
  .status-feed__badge.stage-error {
    background: rgba(239, 68, 68, 0.24);
    border-color: rgba(248, 113, 113, 0.45);
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

  select {
    padding: 0.5rem;
    border-radius: 0.4rem;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.6);
    color: inherit;
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

  .generator-select .meta {
    margin: 0.5rem 0 0.35rem;
    color: rgba(226, 232, 240, 0.75);
  }

  .generator-detail {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.4;
    color: rgba(148, 163, 184, 0.9);
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
