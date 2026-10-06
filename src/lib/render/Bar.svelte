<script lang="ts">
  import { paintToSvg } from '../layout/color';
  import type { BarItem, GBarItem } from '../layout/types';
  import Paint from './Paint.svelte';
  import { barGeometry } from './bar';
  import { svgFill } from './paint';

  let { item }: { item: BarItem | GBarItem } = $props();
  const uid = $props.id();

  const g = $derived(barGeometry(item));
</script>

<svg width={g.w} height={g.h} viewBox="0 0 {g.w} {g.h}" aria-hidden="true">
  <defs>
    <Paint id="{uid}-bg" paint={paintToSvg(g.bg)} />
    <Paint id="{uid}-fill" paint={paintToSvg(g.fill)} />
    <clipPath id="{uid}-clip">
      <rect x={g.fillSpan[0]} y="0" width={g.fillSpan[1] - g.fillSpan[0]} height={g.barH} />
    </clipPath>
  </defs>

  <path d={g.inner} fill={svgFill(g.bg, `${uid}-bg`)} />
  {#if !g.isGBar}
    <path d={g.inner} fill={svgFill(g.fill, `${uid}-fill`)} clip-path="url(#{uid}-clip)" />
  {/if}
  {#if g.bw > 0}
    <path d={g.outer} fill="none" stroke={svgFill(g.border, '')} stroke-width={g.bw} />
  {/if}

  {#if g.indicator}
    <path d={g.indicator} fill={svgFill(g.fill, `${uid}-fill`)} />
  {/if}
</svg>

<style>
  svg {
    display: block;
    overflow: visible;
  }
</style>
