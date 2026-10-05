import { paintToSvg } from '../layout/color';

/** SVG `fill` attribute value for a Stream Deck paint string. */
export function svgFill(value: string | undefined, gradientId: string, fallback: string | undefined): string {
  const p = paintToSvg(value) ?? paintToSvg(fallback);
  if (!p) return 'none';
  return 'stops' in p ? `url(#${gradientId})` : p.solid;
}
