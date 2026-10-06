import { paintToSvg } from '../layout/color';

/** `value` if it is a valid paint, else `fallback`. */
export function pickPaint(value: string | undefined, fallback: string | undefined): string | undefined {
  return paintToSvg(value) ? value : fallback;
}

/** SVG `fill` attribute value for a Stream Deck paint string. */
export function svgFill(value: string | undefined, gradientId: string, fallback?: string): string {
  const p = paintToSvg(value) ?? paintToSvg(fallback);
  if (!p) return 'none';
  return 'stops' in p ? `url(#${gradientId})` : p.solid;
}
