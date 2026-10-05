<script lang="ts">
  import type { PixmapItem } from '../layout/types';

  let { item, src }: { item: PixmapItem; src: string | null } = $props();
</script>

{#if src}
  <img {src} alt={item.key} draggable="false" />
{/if}

<style>
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
