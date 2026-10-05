<script lang="ts">
  import type { GradientStop } from '../layout/color';

  // Emits an SVG <linearGradient> definition when the paint is a gradient.
  let { id, paint }: { id: string; paint: { solid: string } | { stops: GradientStop[] } | null } = $props();
</script>

{#if paint && 'stops' in paint}
  <linearGradient {id} x1="0" y1="0" x2="1" y2="0">
    {#each paint.stops as stop, i (i)}
      <stop offset={stop.offset} stop-color={stop.color} />
    {/each}
  </linearGradient>
{/if}
