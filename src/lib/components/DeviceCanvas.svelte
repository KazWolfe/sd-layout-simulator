<script lang="ts">
  import { paintToCss } from '../layout/color';
  import type { LayoutItem } from '../layout/types';
  import Bar from '../render/Bar.svelte';
  import Pixmap from '../render/Pixmap.svelte';
  import { resolvePixmap } from '../render/pixmap';
  import { PLACEHOLDER_IMAGE, placeholderBarValue, placeholderText } from '../render/placeholder';
  import Text from '../render/Text.svelte';
  import Ruler from './Ruler.svelte';
  import { app } from '../state.svelte';

  const device = $derived(app.device);
  const zoom = $derived(app.zoom);

  interface Entry {
    item: LayoutItem;
    /** Index into the source `items` array. */
    index: number;
    src: string | null;
    /** Pixmap value set but not resolvable (e.g. a plugin path not loaded). */
    unresolved: boolean;
  }

  function withPlaceholder(item: LayoutItem): LayoutItem {
    if (!app.placeholders || item.type === 'pixmap') return item;
    if (item.type === 'text') return item.value !== undefined ? item : { ...item, value: placeholderText(item) };
    return item.value !== undefined ? item : { ...item, value: placeholderBarValue(item) };
  }

  // Stable sort by zOrder so later items draw on top within the same layer.
  const entries: Entry[] = $derived(
    app.renderedItems
      .map((item, i) => {
        const src = item.type === 'pixmap' ? resolvePixmap(item.value, app.assets) : null;
        return {
          item: withPlaceholder(item),
          index: app.sourceIndexOf(i),
          src: item.type === 'pixmap' && !src && app.placeholders ? PLACEHOLDER_IMAGE : src,
          unresolved: item.type === 'pixmap' && !!item.value && !src,
        };
      })
      .sort((a, b) => (a.item.zOrder ?? 0) - (b.item.zOrder ?? 0)),
  );

  const selectedEntry = $derived(entries.find((e) => e.index === app.selected));

  function unresolvedLabel(e: Entry): string | null {
    return e.unresolved && e.item.type === 'pixmap' ? `⚠ ${e.item.value}` : null;
  }

  // How far items extend past each edge of the screen, in screen pixels, so the
  // overlay can show out-of-bounds outlines instead of being clipped.
  const BEZEL = 28;
  const spill = $derived.by(() => {
    let l = 0, t = 0, r = 0, b = 0;
    for (const { item } of entries) {
      const [x, y, w, h] = item.rect;
      l = Math.max(l, -x);
      t = Math.max(t, -y);
      r = Math.max(r, x + w - device.width);
      b = Math.max(b, y + h - device.height);
    }
    const pad = (v: number) => Math.max(0, v * zoom - BEZEL + 4);
    return { l: pad(l), t: pad(t + 4), r: pad(r), b: pad(b) };
  });

  const RULER = 18;
  // Span of the hovered (or else selected) item, shown on the rulers.
  const marked = $derived(
    entries.find((e) => e.index === app.hovered) ?? entries.find((e) => e.index === app.selected),
  );

  function trackPointer(ev: PointerEvent) {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    app.pointer = { x: Math.floor((ev.clientX - r.left) / zoom), y: Math.floor((ev.clientY - r.top) / zoom) };
  }

  // Keep labels legible regardless of zoom.
  const labelSize = $derived(11 / zoom);
</script>

<div class="spill" style:padding="{spill.t}px {spill.r}px {spill.b}px {spill.l}px">
<div class="bezel" style:padding="{BEZEL}px">
  <div
    class="screen"
    style:width="{device.width * zoom}px"
    style:height="{device.height * zoom}px"
    onpointermove={trackPointer}
    onpointerleave={() => (app.pointer = null)}
    role="presentation"
  >
    {#if app.showRulers}
      {@const [mx, my, mw, mh] = marked?.item.rect ?? [0, 0, 0, 0]}
      <div class="ruler-slot top" style:top="-{RULER + 4}px">
        <Ruler orientation="horizontal" length={device.width} {zoom} size={RULER} highlight={marked ? [mx, mx + mw] : null} pointer={app.pointer?.x ?? null} />
      </div>
      <div class="ruler-slot left" style:left="-{RULER + 4}px">
        <Ruler orientation="vertical" length={device.height} {zoom} size={RULER} highlight={marked ? [my, my + mh] : null} pointer={app.pointer?.y ?? null} />
      </div>
    {/if}
    <div class="device" style:width="{device.width}px" style:height="{device.height}px" style:transform="scale({zoom})">
      {#if app.background}
        <div class="background" style:background-image="url({app.background})"></div>
      {/if}
      {#each entries as e (e.index)}
        {@const [x, y, w, h] = e.item.rect}
        <div
          class="item"
          style:left="{x}px"
          style:top="{y}px"
          style:width="{w}px"
          style:height="{h}px"
          style:z-index={e.item.zOrder ?? 0}
          style:opacity={e.item.opacity ?? 1}
          style:background={paintToCss(e.item.background) ?? undefined}
          style:display={e.item.enabled === false ? 'none' : undefined}
        >
          {#if e.item.type === 'text'}
            <Text item={e.item} />
          {:else if e.item.type === 'pixmap'}
            <Pixmap item={e.item} src={e.src} />
          {:else}
            <Bar item={e.item} />
          {/if}
        </div>
      {/each}
    </div>

    <!-- Inspection overlay: outlines, hit-testing, labels. Not part of the device output. -->
    <svg
      class="overlay"
      width={device.width * zoom}
      height={device.height * zoom}
      viewBox="0 0 {device.width} {device.height}"
      role="presentation"
      onpointerdown={(ev) => {
        if (ev.target === ev.currentTarget) app.selected = null;
      }}
    >
      {#each entries as e (e.index)}
        {@const [x, y, w, h] = e.item.rect}
        {@const blocking = app.blockingItems.has(e.index)}
        {@const label = app.showBounds ? unresolvedLabel(e) : null}
        <rect
          {x}
          {y}
          width={Math.max(w, 0)}
          height={Math.max(h, 0)}
          class="hit"
          class:bounds={app.showBounds}
          class:disabled={e.item.enabled === false}
          class:hovered={app.hovered === e.index}
          class:blocking
          class:selected={app.selected === e.index}
          vector-effect="non-scaling-stroke"
          role="button"
          tabindex="-1"
          aria-label={e.item.key}
          onpointerenter={() => (app.hovered = e.index)}
          onpointerleave={() => (app.hovered = null)}
          onpointerdown={() => (app.selected = e.index)}
        />
        {#if label}
          <text x={x + 1} y={y + labelSize} font-size={labelSize} class="missing" clip-path="none">{label}</text>
        {/if}
      {/each}
      {#if selectedEntry}
        {@const [x, y] = selectedEntry.item.rect}
        <text x={x} y={y - 2 / zoom} font-size={labelSize} class="tag" dominant-baseline="text-after-edge">
          {selectedEntry.item.key} · {selectedEntry.item.type} · [{selectedEntry.item.rect.join(', ')}]
        </text>
      {/if}
    </svg>
  </div>
</div>
</div>

<style>
  .bezel {
    border-radius: 18px;
    background: linear-gradient(180deg, #1d1f24, #121317);
    box-shadow:
      inset 0 1px 0 #ffffff12,
      0 10px 30px #0008;
    width: max-content;
  }
  .screen {
    position: relative;
    background: #000;
    box-shadow: 0 0 0 1px #000, 0 0 0 2px #2c2f36;
  }
  .ruler-slot {
    position: absolute;
  }
  .ruler-slot.top {
    left: 0;
    height: 18px;
  }
  .ruler-slot.left {
    top: 0;
    width: 18px;
  }
  .background {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
  }
  .device {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    overflow: hidden;
    --device-font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .item {
    position: absolute;
    overflow: hidden;
  }
  .overlay {
    position: absolute;
    inset: 0;
    overflow: visible;
  }
  .hit {
    fill: transparent;
    stroke: transparent;
    stroke-width: 1px;
    cursor: pointer;
  }
  .hit.bounds {
    stroke: #8aa2ff66;
    stroke-dasharray: 3 3;
  }
  .hit.disabled {
    stroke: #ffffff33;
    stroke-dasharray: 1 3;
  }
  .hit.hovered {
    stroke: #c9d4ffcc;
    stroke-dasharray: none;
  }
  .hit.blocking {
    stroke: var(--error);
    stroke-dasharray: none;
    stroke-width: 2px;
    fill: #ff4d4f22;
  }
  .hit.selected {
    stroke: var(--accent);
    stroke-dasharray: none;
    stroke-width: 2px;
  }
  .tag {
    fill: var(--accent);
    font-family: var(--mono);
    pointer-events: none;
  }
  .missing {
    fill: #ffcf66;
    font-family: var(--mono);
    pointer-events: none;
  }
</style>
