import { defaultRange } from '../layout/schema';
import type { LayoutItem } from '../layout/types';

/**
 * Dummy content for items that have no value yet, so a bare layout still shows
 * how its items will look. Real values (from the layout or feedback) always win.
 */

// Generic "image" glyph: frame, sun, and mountains.
export const PLACEHOLDER_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="#7c8494" stroke-width="2.5" stroke-linejoin="round">' +
    '<rect x="5" y="9" width="38" height="30" rx="4"/>' +
    '<circle cx="17" cy="19" r="3.5" fill="#7c8494" stroke="none"/>' +
    '<path d="M7 35 L19 25 L27 31 L33 26 L41 33" />' +
    '</svg>',
)}`;

export const PLACEHOLDER_BAR_VALUE = 0.5;

export function placeholderText(item: LayoutItem): string {
  return `{{${item.key}}}`;
}

export function placeholderBarValue(item: LayoutItem): number {
  const range = 'range' in item && item.range ? item.range : defaultRange();
  return range.min + (range.max - range.min) * PLACEHOLDER_BAR_VALUE;
}
