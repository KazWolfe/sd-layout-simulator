<script lang="ts">
  import { colorToCss } from '../layout/color';
  import { itemDefaults } from '../layout/schema';
  import type { TextItem } from '../layout/types';
  import { FALLBACK_FONT_SIZE } from './raster';

  let { item }: { item: TextItem } = $props();

  let el: HTMLDivElement | undefined = $state();
  let overflowing = $state(false);

  // Documented defaults from the layout schema.
  const defaults = itemDefaults('text') as Partial<TextItem>;
  const overflow = $derived(item['text-overflow'] ?? defaults['text-overflow']);
  const align = $derived(item.alignment ?? defaults.alignment ?? 'center');

  $effect(() => {
    // Re-measure whenever anything affecting layout changes.
    void [item.value, item.font?.size, item.font?.weight, item.rect[2], align];
    if (el) overflowing = el.scrollWidth > el.clientWidth + 0.5;
  });
</script>

<div
  bind:this={el}
  class="text"
  class:ellipsis={overflow === 'ellipsis'}
  class:fade={overflow === 'fade' && overflowing}
  style:color={colorToCss(item.color ?? defaults.color ?? '') ?? undefined}
  style:font-size="{item.font?.size ?? FALLBACK_FONT_SIZE}px"
  style:font-weight={item.font?.weight ?? 400}
  style:text-align={align}
  style:line-height="{item.rect[3]}px"
>
  {item.value ?? ''}
</div>

<style>
  .text {
    width: 100%;
    height: 100%;
    white-space: pre;
    overflow: hidden;
    font-family: var(--device-font);
  }
  .ellipsis {
    text-overflow: ellipsis;
  }
  .fade {
    mask-image: linear-gradient(to right, #000 calc(100% - 16px), transparent);
  }
</style>
