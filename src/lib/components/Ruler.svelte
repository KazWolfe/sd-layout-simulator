<script lang="ts">
  // Pixel ruler along one edge of the device screen. Drawn in screen pixels
  // (not scaled) so ticks and labels stay crisp at any zoom.
  let {
    orientation,
    length,
    zoom,
    size,
    highlight = null,
    pointer = null,
  }: {
    orientation: 'horizontal' | 'vertical';
    /** Length in device pixels. */
    length: number;
    zoom: number;
    /** Thickness of the ruler in screen pixels. */
    size: number;
    /** Device-pixel span to highlight, e.g. the selected item's extent. */
    highlight?: [start: number, end: number] | null;
    /** Pointer position in device pixels. */
    pointer?: number | null;
  } = $props();

  const pick = (steps: number[], minPx: number) => steps.find((s) => s * zoom >= minPx) ?? steps.at(-1)!;
  const minor = $derived(pick([1, 2, 5, 10, 20], 4));
  const major = $derived(pick([10, 20, 25, 50, 100], 36));

  const ticks = $derived.by(() => {
    const out: { at: number; kind: 'major' | 'mid' | 'minor' }[] = [];
    for (let v = 0; v <= length; v += minor) {
      const kind = v % major === 0 ? 'major' : (v * 2) % major === 0 ? 'mid' : 'minor';
      out.push({ at: v, kind });
    }
    if (length % minor !== 0) out.push({ at: length, kind: 'major' });
    return out;
  });

  const tickLen = { major: 0.6, mid: 0.4, minor: 0.22 };
  const horizontal = $derived(orientation === 'horizontal');
  const w = $derived(horizontal ? length * zoom : size);
  const h = $derived(horizontal ? size : length * zoom);
</script>

<svg class="ruler {orientation}" width={w} height={h} aria-hidden="true">
  <rect width={w} height={h} class="bg" />
  {#if highlight}
    {@const a = Math.max(0, highlight[0]) * zoom}
    {@const b = Math.min(length, highlight[1]) * zoom}
    {#if horizontal}
      <rect x={a} y="0" width={Math.max(0, b - a)} height={h} class="hl" />
    {:else}
      <rect x="0" y={a} width={w} height={Math.max(0, b - a)} class="hl" />
    {/if}
  {/if}
  {#each ticks as t (t.at)}
    {@const p = Math.min(t.at * zoom, (horizontal ? w : h) - 0.5) + 0.5}
    {@const l = size * tickLen[t.kind]}
    {#if horizontal}
      <line x1={p} x2={p} y1={h} y2={h - l} class={t.kind} />
      {#if t.kind === 'major'}
        <text x={p + 2} y={size * 0.45} class:end={t.at === length}>{t.at}</text>
      {/if}
    {:else}
      <line y1={p} y2={p} x1={w} x2={w - l} class={t.kind} />
      {#if t.kind === 'major'}
        <text x={size * 0.45} y={p + 2} transform="rotate(-90 {size * 0.45} {p + 2})" text-anchor="end" class:end={t.at === length}>{t.at}</text>
      {/if}
    {/if}
  {/each}
  {#if pointer !== null}
    {@const p = pointer * zoom + 0.5}
    {#if horizontal}
      <line x1={p} x2={p} y1="0" y2={h} class="pointer" />
    {:else}
      <line y1={p} y2={p} x1="0" x2={w} class="pointer" />
    {/if}
  {/if}
</svg>

<style>
  .ruler {
    position: absolute;
    display: block;
    overflow: hidden;
    pointer-events: none;
  }
  .bg {
    fill: #0b0c0f;
  }
  .hl {
    fill: var(--accent-bg);
  }
  line {
    stroke: #5d6472;
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  line.major {
    stroke: #8b93a3;
  }
  line.pointer {
    stroke: var(--accent);
  }
  text {
    fill: #8b93a3;
    font: 9px var(--mono);
    dominant-baseline: middle;
  }
  .horizontal text.end {
    text-anchor: end;
    transform: translateX(-4px);
  }
</style>
