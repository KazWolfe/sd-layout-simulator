import { defaultRange, itemDefaults } from '../layout/schema';
import type { BarItem, GBarItem } from '../layout/types';
import { pickPaint } from './paint';

/** Shapes and paints for a bar / gbar, shared by the SVG and canvas renderers. */
export interface BarGeometry {
  w: number;
  h: number;
  isGBar: boolean;
  /** Height of the bar itself (gbar: the indicator sits beneath it). */
  barH: number;
  /** Border width. */
  bw: number;
  /** Border path, inset by half the stroke so the stroke stays inside the rect. */
  outer: string;
  /** Background + fill path, inside the border. */
  inner: string;
  /** Horizontal extent of the fill. */
  fillSpan: [number, number];
  /** gbar triangle indicator path, or null when there is no room for it. */
  indicator: string | null;
  /** Paint strings; the documented default when unset or invalid. */
  bg: string | undefined;
  fill: string | undefined;
  border: string | undefined;
}

export function barGeometry(item: BarItem | GBarItem): BarGeometry {
  // Documented defaults from the layout schema.
  const defaults = itemDefaults(item.type) as Partial<GBarItem>;

  const [, , w, h] = item.rect;
  const isGBar = item.type === 'gbar';
  const barH = isGBar ? Math.min((item as GBarItem).bar_h ?? defaults.bar_h ?? h, h) : h;
  const subtype = item.subtype ?? defaults.subtype;
  const bw = Math.max(0, item.border_w ?? defaults.border_w ?? 0);

  const { min, max } = item.range ?? defaultRange();
  const fraction = max > min ? Math.min(1, Math.max(0, ((item.value ?? 0) - min) / (max - min))) : 0;

  const isTrapezoid = subtype === 2;
  // DoubleRectangle / DoubleTrapezoid are two shapes back to back (the
  // trapezoids are tall at both edges, narrowing to the middle). They fill from
  // the center outward, so the midpoint of the range is "zero".
  const isDoubleTrapezoid = subtype === 3;
  const fromCenter = subtype === 1 || subtype === 3;

  /** Path for the bar shape inside the box (x, y, sw, sh). */
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

  const gap = bw;
  const at = gap + (w - gap * 2) * fraction;
  const fillSpan: [number, number] = fromCenter ? [Math.min(at, w / 2), Math.max(at, w / 2)] : [0, at];

  const triTop = barH + 1;
  const triHalf = Math.max(2, (h - triTop) * 0.6);
  const triX = Math.min(w - triHalf, Math.max(triHalf, w * fraction));

  return {
    w,
    h,
    isGBar,
    barH,
    bw,
    outer: shape(bw / 2, bw / 2, w - bw, barH - bw),
    inner: shape(gap, gap, w - gap * 2, barH - gap * 2),
    fillSpan,
    indicator: isGBar && h - triTop > 1 ? `M${triX},${triTop} L${triX + triHalf},${h} L${triX - triHalf},${h} Z` : null,
    bg: pickPaint(item.bar_bg_c, defaults.bar_bg_c),
    fill: pickPaint(item.bar_fill_c, defaults.bar_fill_c),
    border: pickPaint(item.bar_border_c, defaults.bar_border_c),
  };
}
