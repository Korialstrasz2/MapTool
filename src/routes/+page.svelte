<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    baseParameters,
    generatorFamilies,
    activeFamilyId,
    activeVariantId,
    generatorResult,
    isGenerating,
    lastDuration,
    summary,
    randomizeSeed,
    generationStatus,
    generationTimeline,
    resetGenerationTimeline,
    appendGenerationTimeline,
    setActiveFamily,
    setActiveVariant,
    parameterDefinitions,
    currentFamily,
    currentVariant,
    currentParameters,
    updateGeneratorParameter,
    updateBaseParameter,
    generatorRequestPayload
  } from '$stores/generatorStore';
  import {
    brushSettings,
    setBrushMode,
    setBrushSize,
    setBrushStrength,
    setBrushTargetHeight,
    applyBrushStroke
  } from '$stores/brushStore';
  import type {
    GenerationTimelineEntry,
    GenerationTimelineStage
  } from '$stores/generatorStore';
  import type { WorkerMessage } from '$lib/types/generation';
  import { MapRenderer } from '$lib/render/MapRenderer';

  let canvasContainer: HTMLDivElement | null = null;
  let brushLayer: HTMLDivElement | null = null;
  let worker: Worker | null = null;
  let renderer: MapRenderer | null = null;
  let unsubscribe: (() => void) | null = null;
  let errorMessage: string | null = null;
  let rendererReady = false;
  let timelineEntries: GenerationTimelineEntry[] = [];
  let latestTimelineEntry: GenerationTimelineEntry | undefined;
  let isBrushing = false;
  let brushCursor = { x: 0, y: 0, diameter: 0, visible: false };

  const canUseBrowser = typeof window !== 'undefined';
  const families = generatorFamilies;

  const STAGE_LABELS: Record<GenerationTimelineStage, string> = {
    requesting: 'Dispatching',
    'renderer-ready': 'Renderer ready',
    'loading-module': 'Preparing engine',
    'module-ready': 'Engine ready',
    generating: 'Generating terrain',
    transferring: 'Transferring data',
    rendering: 'Rendering map',
    ready: 'Complete',
    error: 'Error'
  };

  const DETAIL_LABELS: Record<string, string> = {
    seed: 'Seed',
    width: 'Width',
    height: 'Height',
    generatorDurationMs: 'Generator time',
    familyId: 'Generator',
    variantId: 'Variant'
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

  function displayParameterValue(def: { step?: number }, value: number | undefined): string {
    if (value === undefined || Number.isNaN(value)) {
      return '';
    }
    if (!def.step) {
      return value.toFixed(2);
    }
    if (def.step >= 1) {
      return value.toFixed(0);
    }
    if (def.step >= 0.1) {
      return value.toFixed(1);
    }
    return value.toFixed(2);
  }

  function chooseFamily(id: string) {
    setActiveFamily(id);
    if (worker) {
      worker.postMessage({ type: 'prime-family', familyId: id });
    }
  }

  function chooseVariant(id: string) {
    setActiveVariant(id);
    if (worker) {
      const familyId = get(currentFamily).id;
      worker.postMessage({ type: 'prime-family', familyId });
    }
  }

  function updateBrushPosition(event: PointerEvent) {
    if (!brushLayer) {
      return null;
    }
    const result = get(generatorResult);
    if (!result) {
      return null;
    }
    const rect = brushLayer.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const nx = px / rect.width;
    const ny = py / rect.height;
    const mapX = nx * result.width;
    const mapY = ny * result.height;
    const settings = get(brushSettings);
    const diameter = (settings.size * 2 * rect.width) / result.width;
    brushCursor = { x: px, y: py, diameter, visible: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
    return { mapX, mapY };
  }

  function beginBrush(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }
    const coords = updateBrushPosition(event);
    if (!coords || !brushLayer) {
      return;
    }
    isBrushing = true;
    brushLayer.setPointerCapture(event.pointerId);
    const updated = applyBrushStroke(coords.mapX, coords.mapY, 1, 1);
    if (updated) {
      renderer?.render(updated);
    }
    event.preventDefault();
  }

  function moveBrush(event: PointerEvent) {
    const coords = updateBrushPosition(event);
    if (!coords) {
      return;
    }
    if (isBrushing) {
      const updated = applyBrushStroke(coords.mapX, coords.mapY, 1, 1);
      if (updated) {
        renderer?.render(updated);
      }
      event.preventDefault();
    }
  }

  function endBrush(event: PointerEvent) {
    if (brushLayer && brushLayer.hasPointerCapture(event.pointerId)) {
      brushLayer.releasePointerCapture(event.pointerId);
    }
    isBrushing = false;
    brushCursor = { ...brushCursor, visible: false };
  }

  $: timelineEntries = $generationTimeline;
  $: latestTimelineEntry = timelineEntries.at(-1);
  $: selectedFamily = $currentFamily;
  $: selectedVariant = $currentVariant;
  $: parameters = $currentParameters;
  $: parameterDefs = $parameterDefinitions;
  $: brushState = $brushSettings;
  $: showBrushOverlay = rendererReady && $activeFamilyId === 'brush-sculptor' && Boolean($generatorResult);

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
    worker.postMessage({ type: 'prime-family', familyId: get(activeFamilyId) });

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
    const payload = get(generatorRequestPayload);
    resetGenerationTimeline();
    if (rendererReady && canvasContainer) {
      appendGenerationTimeline('renderer-ready', 'Renderer ready.', {
        width: canvasContainer.clientWidth,
        height: canvasContainer.clientHeight
      });
    }
    appendGenerationTimeline('requesting', 'Dispatching parameters to worker…', {
      seed: payload.seed,
      width: payload.width,
      height: payload.height,
      familyId: payload.familyId,
      variantId: payload.variantId
    });
    isGenerating.set(true);
    generationStatus.set('Preparing generation…');
    console.info('[MapTool] Triggering generation', payload);
    worker.postMessage({ type: 'generate', payload });
  }

  function onBaseParamChange(key: 'seed' | 'width' | 'height', value: number) {
    updateBaseParameter(key, value);
    console.info('[MapTool] Updated base parameter', { key, value });
  }

  function onParameterChange(id: string, value: number) {
    updateGeneratorParameter(id, value);
    console.info('[MapTool] Updated generator parameter', { id, value });
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
    {#if showBrushOverlay}
      <div
        class="brush-overlay"
        bind:this={brushLayer}
        on:pointerdown={beginBrush}
        on:pointermove={moveBrush}
        on:pointerup={endBrush}
        on:pointerleave={endBrush}
        on:pointercancel={endBrush}
        on:contextmenu|preventDefault
      >
        {#if brushCursor.visible}
          <div
            class="brush-cursor"
            style={`width: ${brushCursor.diameter}px; height: ${brushCursor.diameter}px; transform: translate(${brushCursor.x - brushCursor.diameter / 2}px, ${brushCursor.y - brushCursor.diameter / 2}px);`}
          />
        {/if}
      </div>
    {/if}
  </div>
  <aside class="control-panel">
    <header>
      <h1>Regional Map Generator</h1>
      <p>Switch between four distinct engines, each with curated variants.</p>
    </header>

    <section class="base-controls">
      <label>
        Seed
        <input
          type="number"
          min="0"
          max="4294967295"
          value={$baseParameters.seed}
          on:change={(event) =>
            onBaseParamChange('seed', Math.max(0, Math.floor(Number(event.currentTarget.value) || 0)))}
        />
      </label>
      <div class="dimension-grid">
        <label>
          Width
          <input
            type="number"
            min="128"
            max="2048"
            step="64"
            value={$baseParameters.width}
            on:change={(event) => {
              const raw = Number(event.currentTarget.value);
              const clamped = Math.min(2048, Math.max(128, Number.isFinite(raw) ? raw : 512));
              const snapped = Math.round(clamped / 64) * 64;
              onBaseParamChange('width', snapped);
            }}
          />
        </label>
        <label>
          Height
          <input
            type="number"
            min="128"
            max="2048"
            step="64"
            value={$baseParameters.height}
            on:change={(event) => {
              const raw = Number(event.currentTarget.value);
              const clamped = Math.min(2048, Math.max(128, Number.isFinite(raw) ? raw : 512));
              const snapped = Math.round(clamped / 64) * 64;
              onBaseParamChange('height', snapped);
            }}
          />
        </label>
      </div>
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

    <section class="generator-family">
      <h2>Generator family</h2>
      <div class="family-grid">
        {#each families as family (family.id)}
          <button
            type="button"
            class:active={family.id === $activeFamilyId}
            on:click={() => chooseFamily(family.id)}
          >
            <span class="family-name">{family.name}</span>
            <span class="family-tags">
              {#each family.tags as tag}
                <span>{tag}</span>
              {/each}
            </span>
          </button>
        {/each}
      </div>
      <p class="family-description">{selectedFamily.description}</p>
    </section>

    <section class="variant-section">
      <h2>Variant</h2>
      <div class="variant-row">
        {#each selectedFamily.variants as variant (variant.id)}
          <button
            type="button"
            class:active={variant.id === $activeVariantId}
            on:click={() => chooseVariant(variant.id)}
          >
            {variant.name}
          </button>
        {/each}
      </div>
      <p class="variant-description">{selectedVariant.description}</p>
    </section>

    <section class="parameters-section">
      <h2>Parameters</h2>
      {#if parameterDefs.length === 0}
        <p>No adjustable parameters for this generator.</p>
      {:else}
        {#each parameterDefs as param (param.id)}
          <div class="parameter-control">
            <label>
              <span class="param-label">{param.label}</span>
              {#if param.type === 'range'}
                <input
                  type="range"
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={parameters[param.id] ?? param.defaultValue}
                  on:input={(event) =>
                    onParameterChange(param.id, Number(event.currentTarget.value))}
                />
              {:else}
                <input
                  type="number"
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={parameters[param.id] ?? param.defaultValue}
                  on:change={(event) =>
                    onParameterChange(param.id, Number(event.currentTarget.value))}
                />
              {/if}
              <span class="param-value">
                {displayParameterValue(param, parameters[param.id] ?? param.defaultValue)}
              </span>
            </label>
            {#if param.description}
              <p class="param-help">{param.description}</p>
            {/if}
          </div>
        {/each}
      {/if}
    </section>

    {#if showBrushOverlay}
      <section class="brush-controls">
        <h2>Brush sculpting</h2>
        <div class="mode-row">
          {#each ['raise', 'lower', 'flatten', 'water'] as mode}
            <button
              type="button"
              class:active={brushState.mode === mode}
              on:click={() => setBrushMode(mode)}
            >
              {mode}
            </button>
          {/each}
        </div>
        <label>
          Brush size
          <input
            type="range"
            min="4"
            max="160"
            step="2"
            value={brushState.size}
            on:input={(event) => setBrushSize(Number(event.currentTarget.value))}
          />
          <span>{Math.round(brushState.size)}</span>
        </label>
        <label>
          Intensity
          <input
            type="range"
            min="0.01"
            max="0.2"
            step="0.01"
            value={brushState.strength}
            on:input={(event) => setBrushStrength(Number(event.currentTarget.value))}
          />
          <span>{brushState.strength.toFixed(2)}</span>
        </label>
        <label>
          Target height
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={brushState.targetHeight}
            on:input={(event) => setBrushTargetHeight(Number(event.currentTarget.value))}
          />
          <span>{brushState.targetHeight.toFixed(2)}</span>
        </label>
      </section>
    {/if}

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
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  header h1 {
    margin: 0 0 0.5rem;
    font-size: 1.4rem;
  }

  header p {
    margin: 0;
    color: rgba(226, 232, 240, 0.7);
  }

  .control-panel section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .base-controls label,
  .brush-controls label,
  .parameters-section label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.95);
  }

  .base-controls span,
  .brush-controls span,
  .parameters-section .param-value {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.85);
  }

  .control-panel input[type='number'] {
    padding: 0.5rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.6);
    color: #f1f5f9;
  }

  .control-panel input[type='range'] {
    width: 100%;
  }

  .buttons {
    display: flex;
    gap: 0.75rem;
  }

  .buttons button {
    flex: 1;
    padding: 0.65rem 1rem;
    border-radius: 0.6rem;
    border: none;
    font-weight: 600;
    cursor: pointer;
    background: linear-gradient(120deg, #2563eb, #38bdf8);
    color: #0b172a;
    transition: transform 150ms ease, box-shadow 150ms ease, opacity 120ms ease;
  }

  .buttons button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .buttons button:not(:disabled):hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 20px rgba(56, 189, 248, 0.25);
  }

  .dimension-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .dimension-grid input {
    width: 100%;
  }

  .generator-family,
  .variant-section,
  .parameters-section,
  .brush-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .family-grid {
    display: grid;
    gap: 0.5rem;
  }

  .family-grid button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.6rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.6);
    color: #e2e8f0;
    transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
  }

  .family-grid button.active {
    border-color: rgba(56, 189, 248, 0.6);
    background: rgba(14, 165, 233, 0.18);
    transform: translateY(-1px);
  }

  .family-name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .family-tags {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.85);
  }

  .family-tags span {
    padding: 0.1rem 0.45rem;
    border-radius: 9999px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(30, 41, 59, 0.65);
  }

  .family-description,
  .variant-description {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.8);
  }

  .variant-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .variant-row button {
    padding: 0.45rem 0.75rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.6);
    color: #e2e8f0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .variant-row button.active {
    border-color: rgba(56, 189, 248, 0.6);
    background: rgba(14, 165, 233, 0.2);
  }

  .parameters-section {
    gap: 1rem;
  }

  .parameter-control {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 0.75rem;
    padding: 0.75rem;
  }

  .param-help {
    margin: 0;
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .mode-row {
    display: flex;
    gap: 0.5rem;
  }

  .mode-row button {
    flex: 1;
    padding: 0.45rem 0.6rem;
    border-radius: 0.65rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.6);
    color: #e2e8f0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .mode-row button.active {
    border-color: rgba(56, 189, 248, 0.6);
    background: rgba(14, 165, 233, 0.2);
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
