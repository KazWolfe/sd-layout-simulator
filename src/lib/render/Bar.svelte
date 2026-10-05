<script lang="ts">
  import { paintToSvg } from '../layout/color';
  import { defaultRange, itemDefaults } from '../layout/schema';
  import type { BarItem, GBarItem } from '../layout/types';
  import Paint from './Paint.svelte';
  import { svgFill } from './paint';

  let { item }: { item: BarItem | GBarItem } = $props();
  const uid = $props.id();

  // Documented defaults from the layout schema.
  const defaults = $derived(itemDefaults(item.type) as Partial<GBarItem>);

  const w = $derived(item.rect[2]);
  const h = $derived(item.rect[3]);
  const isGBar = $derived(item.type === 'gbar');
  // gbar: the bar occupies the top `bar_h` pixels; the indicator sits beneath it.
  const barH = $derived(isGBar ? Math.min((item as GBarItem).bar_h ?? defaults.bar_h ?? h, h) : h);
  const subtype = $derived(item.subtype ?? defaults.subtype);
  const bw = $derived(Math.max(0, item.border_w ?? defaults.border_w ?? 0));

  const range = $derived(item.range ?? defaultRange());
  const min = $derived(range.min);
  const max = $derived(range.max);
  const fraction = $derived(max > min ? Math.min(1, Math.max(0, ((item.value ?? 0) - min) / (max - min))) : 0);

  const isTrapezoid = $derived(subtype === 2);
  // DoubleRectangle / DoubleTrapezoid are two shapes back to back (the
  // trapezoids are tall at both edges, narrowing to the middle). They fill from
  // the center outward, so the midpoint of the range is "zero".
  const isDoubleTrapezoid = $derived(subtype === 3);
  const fromCenter = $derived(subtype === 1 || subtype === 3);

  /** Path for the bar shape inside the box (x, y, bw, bh). */
  function shape(x: number, y: number, sw: number, sh: number): string {
    if (sw <= 0 || sh <= 0) return '';
    if (isTrapezoid) {
      // Wedge that grows toward the right, like a volume indicator.
      return `M${x},${y + sh} L${x},${y + sh * 0.65} L${x + sw},${y} L${x + sw},${y + sh} Z`;
    }
    if (isDoubleTrapezoid) {
      return `M${x},${y + sh} L${x},${y} L${x + sw / 2},${y + sh * 0.65} L${x + sw},${y} L${x + sw},${y + sh} Z`;
    }
    const r = subtype === 4 ? Math.min(sh / 2, sw / 2) : 0;
    return `M${x + r},${y} H${x + sw - r} A${r},${r} 0 0 1 ${x + sw},${y + r} V${y + sh - r} A${r},${r} 0 0 1 ${x + sw - r},${y + sh} H${x + r} A${r},${r} 0 0 1 ${x},${y + sh - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
  }

  // Outer shape (border), inset by half the stroke so the stroke stays inside the rect.
  const outer = $derived(shape(bw / 2, bw / 2, w - bw, barH - bw));
  // Inner shape (background + fill), inside the border.
  const gap = $derived(bw);
  const inner = $derived(shape(gap, gap, w - gap * 2, barH - gap * 2));

  // Horizontal extent of the fill.
  const fillSpan = $derived.by(() => {
    const at = gap + (w - gap * 2) * fraction;
    if (!fromCenter) return [0, at];
    const center = w / 2;
    return [Math.min(at, center), Math.max(at, center)];
  });

  // gbar triangle indicator
  const triTop = $derived(barH + 1);
  const triHalf = $derived(Math.max(2, (h - triTop) * 0.6));
  const triX = $derived(Math.min(w - triHalf, Math.max(triHalf, w * fraction)));
</script>

<svg width={w} height={h} viewBox="0 0 {w} {h}" aria-hidden="true">
  <defs>
    <Paint id="{uid}-bg" paint={paintToSvg(item.bar_bg_c)} />
    <Paint id="{uid}-fill" paint={paintToSvg(item.bar_fill_c)} />
    <clipPath id="{uid}-clip">
      <rect x={fillSpan[0]} y="0" width={fillSpan[1] - fillSpan[0]} height={barH} />
    </clipPath>
  </defs>

  <path d={inner} fill={svgFill(item.bar_bg_c, `${uid}-bg`, defaults.bar_bg_c)} />
  {#if !isGBar}
    <path d={inner} fill={svgFill(item.bar_fill_c, `${uid}-fill`, defaults.bar_fill_c)} clip-path="url(#{uid}-clip)" />
  {/if}
  {#if bw > 0}
    <path d={outer} fill="none" stroke={svgFill(item.bar_border_c, '', defaults.bar_border_c)} stroke-width={bw} />
  {/if}

  {#if isGBar && h - triTop > 1}
    <path
      d="M{triX},{triTop} L{triX + triHalf},{h} L{triX - triHalf},{h} Z"
      fill={svgFill(item.bar_fill_c, `${uid}-fill`, defaults.bar_fill_c)}
    />
  {/if}
</svg>

<style>
  svg {
    display: block;
    overflow: visible;
  }
</style>
