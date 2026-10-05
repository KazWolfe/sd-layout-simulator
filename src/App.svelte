<script lang="ts">
  import AssetsPanel from './lib/components/AssetsPanel.svelte';
  import DeviceCanvas from './lib/components/DeviceCanvas.svelte';
  import Editor from './lib/components/Editor.svelte';
  import FeedbackPanel from './lib/components/FeedbackPanel.svelte';
  import ItemPanel from './lib/components/ItemPanel.svelte';
  import PayloadPane from './lib/components/PayloadPane.svelte';
  import ProblemsPanel from './lib/components/ProblemsPanel.svelte';
  import Splitter from './lib/components/Splitter.svelte';
  import { presetDevices } from './lib/layout/devices';
  import { formatJson } from './lib/layout/format';
  import { itemIndexAtOffset, itemRanges } from './lib/layout/parse';
  import { TEMPLATES, templateSource } from './lib/layout/templates';
  import type { Diagnostic } from './lib/layout/types';
  import { app } from './lib/state.svelte';
  import { readAsDataUrl, sessionNumber } from './lib/util';
  import { layoutHints, typeHints } from './lib/editor/hints';

  type Tab = 'feedback' | 'item' | 'problems' | 'images';

  // Device presets take their canvas sizes from the active schema.
  const presets = $derived.by(() => {
    void app.schemaVersion;
    return presetDevices();
  });
  const templateGroups = $derived(
    presets.map((d) => ({ device: d, templates: TEMPLATES.filter((t) => (t.layout.controller ?? 'Encoder') === d.controller) })),
  );
  const templateSources = new Set(TEMPLATES.map(templateSource));

  /** Loads a template, confirming first if the editor holds custom work. */
  function load(id: string) {
    if (!id) return;
    if (!templateSources.has(app.source) && !confirm('Replace the current layout? Your edits will be lost.')) return;
    app.loadTemplate(id);
  }
  let tab: Tab = $state('feedback');

  let editor: Editor | undefined = $state();

  const ranges = $derived(itemRanges(app.parsed.tree));
  const highlight = $derived(app.selected !== null ? (ranges[app.selected] ?? null) : null);

  const counts = $derived({
    error: app.diagnostics.filter((d) => d.severity === 'error').length,
    warning: app.diagnostics.filter((d) => d.severity === 'warning').length,
  });

  // Selecting in the preview moves the editor to that item.
  function selectFromPreview(index: number | null) {
    const r = index !== null ? ranges[index] : null;
    if (r) editor?.reveal(r.from);
  }
  let lastSelected: number | null = null;
  let selectionFromEditor = false;
  $effect(() => {
    const s = app.selected;
    if (s !== lastSelected) {
      lastSelected = s;
      if (!selectionFromEditor) selectFromPreview(s);
      selectionFromEditor = false;
    }
  });

  function onCursor(offset: number) {
    const i = itemIndexAtOffset(app.parsed.tree, offset);
    selectionFromEditor = true;
    app.selected = i >= 0 ? i : null;
    if (app.selected === lastSelected) selectionFromEditor = false;
  }

  function reveal(d: Diagnostic) {
    editor?.reveal(d.from, d.to, true);
  }

  function format() {
    const v = app.parsed.value;
    if (v !== undefined && app.parsed.diagnostics.length === 0) app.source = formatJson(v);
  }

  let copied = $state(false);
  async function copy() {
    await navigator.clipboard.writeText(app.source);
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }

  function download() {
    const id = (app.validation.layout?.id ?? 'layout').replace(/[^\w.-]+/g, '-');
    const url = URL.createObjectURL(new Blob([app.source], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${id}.json` });
    a.click();
    // Revoking synchronously can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url));
  }

  async function openFile(files: FileList | null) {
    const f = files?.[0];
    if (f) {
      app.source = await f.text();
      app.selected = null;
    }
  }

  // Resizable splits (percentages), remembered for the browser session.
  let split = $state(sessionNumber.get('split', 44));
  let codeSplit = $state(sessionNumber.get('code-split', 62));

  // Background image: pick or drop an image file.
  let droppingBackground = $state(false);
  async function setBackground(files: FileList | null | undefined) {
    const file = Array.from(files ?? []).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    app.background = await readAsDataUrl(file);
  }
</script>

<header>
  <div class="brand">
    <h1><span class="logo">▭</span> Stream Deck Layout Simulator</h1>
    <a class="repo" href="https://github.com/KazWolfe/sd-layout-simulator" target="_blank" rel="noopener noreferrer" title="Source on GitHub">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
        ><path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
        /></svg
      >
      GitHub
    </a>
  </div>

  <div class="toolbar">
    <select
      aria-label="Load layout"
      onchange={(e) => {
        load(e.currentTarget.value);
        e.currentTarget.value = '';
      }}
    >
      <option value="">Load layout…</option>
      {#each templateGroups as g (g.device.id)}
        <optgroup label={g.device.id === 'neo' ? 'Neo infobar' : g.device.name}>
          {#each g.templates as t (t.id)}
            <option value={t.id}>{t.name}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
    <label class="button">Open…<input type="file" accept=".json,application/json" hidden onchange={(e) => openFile(e.currentTarget.files)} /></label>
    <button onclick={format} disabled={app.parsed.diagnostics.length > 0} title="Reformat JSON">Format</button>
    <button onclick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
    <button onclick={download}>Download</button>
  </div>
</header>

<main style:grid-template-columns="{split}% 6px 1fr">
  <section class="left" style:grid-template-rows="{codeSplit}% 6px 1fr">
    <div class="pane">
      <div class="pane-header">
        <span>Layout JSON</span>
        <span class="status">
          {#if counts.error}<span class="error">● {counts.error} error{counts.error === 1 ? '' : 's'}</span>{/if}
          {#if counts.warning}<span class="warning">▲ {counts.warning}</span>{/if}
          {#if !counts.error && !counts.warning}<span class="ok">✓ valid</span>{/if}
        </span>
      </div>
      <div class="editor-wrap">
        <Editor
          bind:this={editor}
          label="Layout JSON"
          extensions={typeHints(layoutHints)}
          value={app.source}
          diagnostics={app.diagnostics}
          {highlight}
          onchange={(v) => (app.source = v)}
          oncursor={onCursor}
        />
      </div>
    </div>
    <Splitter bind:value={codeSplit} orientation="horizontal" min={20} max={85} storageKey="code-split" />
    <div class="pane">
      <PayloadPane />
    </div>
  </section>

  <Splitter bind:value={split} min={20} max={75} storageKey="split" />

  <section class="inspector">
    <div class="pane-header">
      <div class="device-picker">
        {#if app.declaredController !== undefined}
          <!-- The layout declares a valid device; show it rather than offering a choice. -->
          <span class="declared-device" aria-label="Device">{app.device.name} <small>{app.device.width}×{app.device.height}</small></span>
          <span class="declared" title="Remove &quot;controller&quot; from the layout JSON to preview on other devices.">
            ⚠ Declared by the layout: <code>"controller": {JSON.stringify(app.declaredController)}</code>
          </span>
        {:else}
          <div class="segmented" role="radiogroup" aria-label="Preview device" title="The layout has no valid &quot;controller&quot;; this only changes the preview.">
            {#each presets as d (d.id)}
              <button
                role="radio"
                aria-checked={app.previewDevice === d.id}
                class:active={app.previewDevice === d.id}
                onclick={() => (app.previewDevice = d.id)}>{d.name} <small>{d.width}×{d.height}</small></button
              >
            {/each}
            <button
              role="radio"
              aria-checked={app.previewDevice === 'custom'}
              class:active={app.previewDevice === 'custom'}
              onclick={() => (app.previewDevice = 'custom')}>Custom</button
            >
          </div>
          {#if app.previewDevice === 'custom'}
            <span class="custom-size">
              <input type="number" min="1" max="2000" aria-label="Custom width" bind:value={app.customSize.width} />
              ×
              <input type="number" min="1" max="2000" aria-label="Custom height" bind:value={app.customSize.height} />
              px
            </span>
          {/if}
        {/if}
      </div>
      <div class="segmented" role="radiogroup" aria-label="Preview mode">
        <button role="radio" aria-checked={app.mode === 'layout'} class:active={app.mode === 'layout'} onclick={() => (app.mode = 'layout')}
          >Layout Only</button
        >
        <button
          role="radio"
          aria-checked={app.mode === 'feedback'}
          class:active={app.mode === 'feedback'}
          onclick={() => (app.mode = 'feedback')}
          >With Feedback</button
        >
      </div>
    </div>

    <div
      class="stage"
      class:dropping={droppingBackground}
      role="region"
      aria-label="Preview"
      ondragover={(e) => {
        if (e.dataTransfer?.types.includes('Files')) {
          e.preventDefault();
          droppingBackground = true;
        }
      }}
      ondragleave={() => (droppingBackground = false)}
      ondrop={(e) => {
        e.preventDefault();
        droppingBackground = false;
        setBackground(e.dataTransfer?.files);
      }}
    >
      {#if app.renderBlockers.length}
        <button class="banner" onclick={() => (tab = 'problems')}>
          <strong>Stream Deck would not render this layout.</strong>
          {app.renderBlockers.length} problem{app.renderBlockers.length === 1 ? '' : 's'} with items out of bounds or overlapping on the same zOrder
          (outlined in red). Showing a best-effort preview.
        </button>
      {/if}
      <div class="canvas-scroll">
        {#key app.schemaVersion}<DeviceCanvas />{/key}
      </div>
      <div class="stage-controls">
        <label>
          Zoom
          <input type="range" min="1" max="6" step="0.5" bind:value={app.zoom} />
          <output>{app.zoom}×</output>
        </label>
        <span class="bg-controls" title="Simulated device background, drawn behind the layout. You can also drop an image on the preview.">
          Background
          <label class="button small">{app.background ? 'Change…' : 'Choose…'}<input type="file" accept="image/*" hidden onchange={(e) => setBackground(e.currentTarget.files)} /></label>
          {#if app.background}<button class="small" onclick={() => (app.background = null)} title="Remove background">Clear</button>{/if}
        </span>
        <label><input type="checkbox" bind:checked={app.showBounds} /> Item bounds</label>
        <label><input type="checkbox" bind:checked={app.showRulers} /> Rulers</label>
        <label title="Show dummy content for items without a value"><input type="checkbox" bind:checked={app.placeholders} /> Placeholders</label>
        <output class="coords" aria-label="Pointer position">{app.pointer ? `${app.pointer.x}, ${app.pointer.y}` : ''}</output>
      </div>
    </div>

    <div class="tabs" role="tablist">
      {#each [['feedback', 'Feedback'], ['item', 'Item'], ['problems', 'Problems'], ['images', 'Images']] as const as [id, label] (id)}
        <button role="tab" aria-selected={tab === id} class:active={tab === id} onclick={() => (tab = id)}>
          {label}
          {#if id === 'problems' && app.diagnostics.length}<span class="badge" class:error={counts.error > 0}>{app.diagnostics.length}</span>{/if}
          {#if id === 'item' && app.selected !== null}<span class="badge">{app.layoutItems[app.renderIndexOf(app.selected)]?.key ?? '?'}</span>{/if}
          {#if id === 'images' && Object.keys(app.assets).length}<span class="badge">{Object.keys(app.assets).length}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="tab-body">
      {#if tab === 'feedback'}
        <FeedbackPanel />
      {:else if tab === 'item'}
        <ItemPanel />
      {:else if tab === 'problems'}
        <ProblemsPanel onreveal={reveal} />
      {:else}
        <AssetsPanel />
      {/if}
    </div>
  </section>
</main>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    flex-wrap: wrap;
  }
  h1 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    white-space: nowrap;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .repo {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--muted);
    text-decoration: none;
    padding: 2px 8px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
  }
  .repo:hover {
    color: var(--text);
    border-color: var(--muted);
  }
  .logo {
    color: var(--accent);
  }
  .toolbar {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  main {
    display: grid;
    height: calc(100vh - 49px);
    min-height: 0;
  }
  section {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .status {
    display: flex;
    gap: 10px;
    font-size: 12px;
  }
  .error {
    color: var(--error);
  }
  .warning {
    color: var(--warning);
  }
  .ok {
    color: var(--ok);
  }
  .left {
    display: grid;
    min-height: 0;
  }
  .pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .editor-wrap {
    flex: 1;
    min-height: 0;
  }
  .device-picker {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .declared-device {
    padding: 4px 10px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--accent-bg);
  }
  .declared-device small {
    color: var(--muted);
    margin-left: 4px;
    font-family: var(--mono);
  }
  .declared {
    font-size: 11.5px;
    color: var(--warning);
    white-space: nowrap;
  }
  .declared code {
    color: var(--text);
  }
  .custom-size {
    display: flex;
    gap: 4px;
    align-items: center;
    font-size: 12px;
  }
  .custom-size input {
    width: 60px;
    font: 12px var(--mono);
    color: inherit;
    background: #1f2228;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    padding: 3px 6px;
  }
  .stage.dropping {
    outline: 2px dashed var(--accent);
    outline-offset: -6px;
  }
  .bg-controls {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .small {
    padding: 1px 8px;
    font-size: 12px;
  }
  .stage {
    position: relative;
    display: grid;
    gap: 10px;
    justify-items: center;
    padding: 18px 12px 12px;
    background: radial-gradient(ellipse at center, #1a1c22, var(--bg));
    border-bottom: 1px solid var(--border);
  }
  .canvas-scroll {
    max-width: 100%;
    overflow: auto;
    padding: 4px;
  }
  .banner {
    width: 100%;
    max-width: 720px;
    text-align: left;
    background: #3a1214;
    border: 1px solid var(--error);
    color: #ffd7d7;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12.5px;
    line-height: 1.4;
  }
  .stage-controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    row-gap: 6px;
    white-space: nowrap;
    gap: 18px;
    font-size: 12px;
    color: var(--muted);
    align-items: center;
  }
  .stage-controls label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .stage-controls output {
    width: 28px;
    font-family: var(--mono);
  }
  .stage-controls .coords {
    width: 64px;
    color: var(--text);
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 8px;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: 8px 10px;
    color: var(--muted);
  }
  .tabs button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .tab-body {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
  .badge {
    display: inline-block;
    margin-left: 6px;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--hover);
    font-size: 11px;
    color: var(--text);
    font-family: var(--mono);
  }
  .badge.error {
    background: var(--error);
    color: #fff;
  }
  .segmented small {
    color: var(--muted);
    margin-left: 4px;
    font-family: var(--mono);
  }

  @media (max-width: 800px) {
    main {
      grid-template-columns: 1fr !important;
      grid-template-rows: 40vh auto;
      height: auto;
    }
    main > :global(.splitter) {
      display: none;
    }
  }
</style>
