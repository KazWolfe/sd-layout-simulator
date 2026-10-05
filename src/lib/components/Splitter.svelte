<script lang="ts">
  import { sessionNumber } from '../util';

  // Draggable divider between two grid tracks. `value` is the size of the
  // first track as a percentage of the parent element.
  let {
    value = $bindable(),
    orientation = 'vertical',
    min = 15,
    max = 85,
    storageKey,
  }: {
    value: number;
    /** "vertical" divides columns (drag left/right), "horizontal" divides rows. */
    orientation?: 'vertical' | 'horizontal';
    min?: number;
    max?: number;
    storageKey?: string;
  } = $props();

  function start(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    const parent = el.parentElement!;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = parent.getBoundingClientRect();
      const pct = orientation === 'vertical' ? ((ev.clientX - r.left) / r.width) * 100 : ((ev.clientY - r.top) / r.height) * 100;
      value = Math.min(max, Math.max(min, pct));
    };
    // Fires after pointerup and pointercancel alike, so the drag always ends.
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('lostpointercapture', up);
      if (storageKey) sessionNumber.set(storageKey, value);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('lostpointercapture', up);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="splitter {orientation}" role="separator" aria-orientation={orientation} onpointerdown={start}></div>

<style>
  .splitter {
    background: var(--border);
    touch-action: none;
  }
  .splitter:hover {
    background: var(--accent);
  }
  .vertical {
    cursor: col-resize;
  }
  .horizontal {
    cursor: row-resize;
  }
</style>
