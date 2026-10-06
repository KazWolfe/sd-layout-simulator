import { colorToCss, paintToCss, paintToSvg } from '../layout/color';
import { itemDefaults } from '../layout/schema';
import type { BarItem, GBarItem, LayoutItem, TextItem } from '../layout/types';
import { barGeometry } from './bar';

/**
 * Canvas renderer for the pixel-perfect preview: draws the device screen at its
 * native resolution, to be upscaled with nearest-neighbor filtering. Mirrors the
 * DOM renderers (Text, Pixmap, Bar) so both previews agree.
 */

export const DEVICE_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// The schema documents no default font size.
export const FALLBACK_FONT_SIZE = 12;
// Width of the `fade` text-overflow mask, in device pixels.
const FADE_WIDTH = 16;

export interface RasterEntry {
  item: LayoutItem;
  /** Resolved pixmap source, if any. */
  src: string | null;
}

type Ctx = CanvasRenderingContext2D;

// Decoded images by URL. `onload` callbacks let the caller redraw once an image arrives.
const images = new Map<string, HTMLImageElement>();
const waiting = new Map<string, Set<() => void>>();
const broken = new Set<string>();

/** The decoded image for `src`, or null while it loads (then `onload` is called once). */
function image(src: string, onload: () => void): HTMLImageElement | null {
  const cached = images.get(src);
  // (An SVG with only a viewBox can load with no natural size, so don't test for one.)
  if (cached?.complete) return broken.has(src) ? null : cached;
  if (cached) {
    waiting.get(src)?.add(onload);
    return null;
  }
  const img = new Image();
  images.set(src, img);
  waiting.set(src, new Set([onload]));
  img.onload = img.onerror = (ev) => {
    if (typeof ev !== 'string' && ev.type === 'error') broken.add(src);
    for (const cb of waiting.get(src) ?? []) cb();
    waiting.delete(src);
  };
  img.src = src;
  return null;
}

/**
 * Intrinsic aspect ratio (w / h) of an image. SVGs without width/height report
 * an arbitrary natural size in some browsers, so their viewBox wins.
 */
function aspect(img: HTMLImageElement): number {
  const comma = img.src.indexOf(',');
  const header = img.src.slice(0, comma);
  if (header.startsWith('data:image/svg+xml')) {
    let svg = '';
    try {
      const body = img.src.slice(comma + 1);
      svg = header.endsWith(';base64') ? atob(body) : decodeURIComponent(body);
    } catch {
      // Fall through to the natural size.
    }
    const vb = /viewBox\s*=\s*["']\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)/i.exec(svg);
    if (vb && +vb[1] > 0 && +vb[2] > 0) return +vb[1] / +vb[2];
  }
  return img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
}

/** Canvas fill style for a paint string (gradients run left to right across `width`). */
function fillStyle(ctx: Ctx, value: string | undefined, width: number): string | CanvasGradient | null {
  const p = paintToSvg(value);
  if (!p) return null;
  if ('solid' in p) return p.solid;
  const g = ctx.createLinearGradient(0, 0, width, 0);
  for (const s of p.stops) g.addColorStop(s.offset, s.color);
  return g;
}

function layer(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Draws `img` into the box like `object-fit: cover` (cover) or `contain`. */
function drawFitted(ctx: Ctx, img: HTMLImageElement, w: number, h: number, mode: 'cover' | 'contain') {
  const a = aspect(img);
  const pick = mode === 'cover' ? Math.max : Math.min;
  const scale = pick(w / a, h);
  const dw = scale * a;
  const dh = scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawText(ctx: Ctx, item: TextItem, w: number, h: number) {
  const defaults = itemDefaults('text') as Partial<TextItem>;
  const overflow = item['text-overflow'] ?? defaults['text-overflow'];
  const align = item.alignment ?? defaults.alignment ?? 'center';
  const color = colorToCss(item.color ?? defaults.color ?? '');
  const value = item.value ?? '';
  if (!value) return;

  ctx.font = `${item.font?.weight ?? 400} ${item.font?.size ?? FALLBACK_FONT_SIZE}px ${DEVICE_FONT}`;
  ctx.fillStyle = color ?? '#000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Matches CSS `line-height: <rect height>`: the font's content area is centered in each line.
  const m = ctx.measureText(value);
  const baseline = (h - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;

  let overflowing = false;
  value.split('\n').forEach((line, i) => {
    let text = line;
    let tw = ctx.measureText(text).width;
    if (tw > w) {
      overflowing = true;
      if (overflow === 'ellipsis') {
        while (text && ctx.measureText(text + '…').width > w) text = text.slice(0, -1);
        text += '…';
        tw = ctx.measureText(text).width;
      }
    }
    // Lines too long for the box are start-aligned, as in CSS.
    const x = tw > w ? 0 : align === 'left' ? 0 : align === 'right' ? w - tw : (w - tw) / 2;
    ctx.fillText(text, x, baseline + i * h);
  });

  if (overflow === 'fade' && overflowing) {
    const fade = ctx.createLinearGradient(w - FADE_WIDTH, 0, w, 0);
    fade.addColorStop(0, '#000');
    fade.addColorStop(1, 'transparent');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawBar(ctx: Ctx, item: BarItem | GBarItem) {
  const g = barGeometry(item);
  const inner = new Path2D(g.inner);
  const bg = fillStyle(ctx, g.bg, g.w);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fill(inner);
  }
  const fill = fillStyle(ctx, g.fill, g.w);
  if (!g.isGBar && fill) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.fillSpan[0], 0, g.fillSpan[1] - g.fillSpan[0], g.barH);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fill(inner);
    ctx.restore();
  }
  const border = fillStyle(ctx, g.border, g.w);
  if (g.bw > 0 && border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = g.bw;
    ctx.stroke(new Path2D(g.outer));
  }
  if (g.indicator && fill) {
    ctx.fillStyle = fill;
    ctx.fill(new Path2D(g.indicator));
  }
}

/**
 * Renders the screen into `canvas` at native resolution. Items must already be
 * in paint order. `onload` is called when a pending image becomes available.
 */
export function rasterize(
  canvas: HTMLCanvasElement,
  size: { width: number; height: number },
  entries: RasterEntry[],
  background: string | null,
  onload: () => void,
) {
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size.width, size.height);

  const bgImg = background ? image(background, onload) : null;
  if (bgImg) drawFitted(ctx, bgImg, size.width, size.height, 'cover');

  for (const { item, src } of entries) {
    if (item.enabled === false) continue;
    const [x, y, w, h] = item.rect;
    const lw = Math.ceil(w);
    const lh = Math.ceil(h);
    if (lw <= 0 || lh <= 0) continue;

    // Each item gets its own layer: it clips to the rect and takes opacity as a group, like the DOM version.
    const [el, lc] = layer(lw, lh);
    const bg = paintToCss(item.background) !== null ? fillStyle(lc, item.background, w) : null;
    if (bg) {
      lc.fillStyle = bg;
      lc.fillRect(0, 0, w, h);
    }
    if (item.type === 'text') {
      // Separate layer so a `fade` mask doesn't affect the item background.
      const [tl, tc] = layer(lw, lh);
      drawText(tc, item, w, h);
      lc.drawImage(tl, 0, 0);
    } else if (item.type === 'pixmap') {
      const img = src ? image(src, onload) : null;
      if (img) drawFitted(lc, img, w, h, 'contain');
    } else {
      drawBar(lc, item);
    }

    ctx.globalAlpha = item.opacity ?? 1;
    ctx.drawImage(el, x, y);
    ctx.globalAlpha = 1;
  }
}
