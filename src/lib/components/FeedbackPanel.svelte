<script lang="ts">
  import { defaultRange } from '../layout/schema';
  import type { LayoutItem } from '../layout/types';
  import { app } from '../state.svelte';
  import { readAsDataUrl } from '../util';

  const current = $derived(app.feedbackItems);

  function rangeOf(item: LayoutItem) {
    return 'range' in item && item.range ? item.range : defaultRange();
  }

  async function pickImage(key: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    app.setItemValue(key, await readAsDataUrl(file));
  }

</script>

<div class="panel">
  <section>
    <h3>Quick controls</h3>
    <p class="hint">
      Quickly apply simple changes to <b>Live Feedback</b> for interactive previews.
    </p>
    {#if current.length === 0}
      <p class="empty">No items in the layout.</p>
    {:else if !app.payload}
      <p class="msg warning">The Live Feedback payload isn't valid JSON; fix it to use quick controls.</p>
    {/if}
    <div class="controls" class:disabled={!app.payload}>
      {#each current as item, i (i)}
        {@const srcIndex = app.sourceIndexOf(i)}
        <label
          class="control"
          class:selected={app.selected === srcIndex}
          onpointerenter={() => (app.hovered = srcIndex)}
          onpointerleave={() => (app.hovered = null)}
        >
          <span class="key" title="{item.key} ({item.type})">{item.key}<small>{item.type}</small></span>
          {#if item.type === 'text'}
            <input
              type="text"
              value={item.value ?? ''}
              placeholder="(empty)"
              oninput={(e) => app.setItemValue(item.key, e.currentTarget.value)}
            />
          {:else if item.type === 'pixmap'}
            <span class="pix">
              <input
                type="text"
                value={item.value?.startsWith('data:') ? '(uploaded image)' : (item.value ?? '')}
                placeholder="path, data URI or <svg>"
                onchange={(e) => app.setItemValue(item.key, e.currentTarget.value)}
              />
              <input type="file" accept="image/*" onchange={(e) => pickImage(item.key, e.currentTarget.files)} title="Upload image" />
            </span>
          {:else}
            {@const r = rangeOf(item)}
            <span class="slider">
              <input
                type="range"
                min={r.min}
                max={r.max}
                step="any"
                value={item.value ?? r.min}
                oninput={(e) => app.setItemValue(item.key, Math.round(e.currentTarget.valueAsNumber * 100) / 100)}
              />
              <output>{Math.round((item.value ?? 0) * 100) / 100}</output>
            </span>
          {/if}
        </label>
      {/each}
    </div>
  </section>
</div>

<style>
  .controls.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  .controls {
    display: grid;
    gap: 6px;
  }
  .control {
    display: grid;
    grid-template-columns: 120px 1fr;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
  }
  .control.selected {
    background: var(--accent-bg);
  }
  .key {
    font-family: var(--mono);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .key small {
    color: var(--muted);
    margin-left: 6px;
  }
  .pix {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
  }
  .pix input[type='file'] {
    width: 96px;
    font-size: 11px;
  }
  .slider {
    display: grid;
    grid-template-columns: 1fr 48px;
    gap: 8px;
    align-items: center;
  }
  output {
    font-family: var(--mono);
    font-size: 12px;
    text-align: right;
  }
</style>
