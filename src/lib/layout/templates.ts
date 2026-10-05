import type { Layout } from './types';
import { formatJson } from './format';

/**
 * Built-in Stream Deck + layouts (as documented at
 * https://docs.elgato.com/streamdeck/sdk/guides/dials/#built-in-layouts),
 * plus starter custom layouts for each device.
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  layout: Layout;
}

const SCHEMA = 'https://schemas.elgato.com/streamdeck/plugins/layout.json';

const title = { key: 'title', type: 'text', rect: [16, 10, 136, 24], font: { size: 16, weight: 600 }, alignment: 'left' } as const;
const icon48 = (x: number) => ({ key: 'icon', type: 'pixmap', rect: [x, 40, 48, 48] }) as const;
const value = { key: 'value', type: 'text', rect: [76, 40, 108, 32], font: { size: 24, weight: 600 }, alignment: 'right' } as const;

export const TEMPLATES: Template[] = [
  {
    id: '$X1',
    name: '$X1 — Icon',
    description: 'Title with a centered icon (default layout).',
    layout: { $schema: SCHEMA, id: '$X1', items: [title, icon48(76)] },
  },
  {
    id: '$A0',
    name: '$A0 — Canvas',
    description: 'Full-canvas background with title and canvas overlay.',
    layout: {
      $schema: SCHEMA,
      id: '$A0',
      items: [
        { key: 'full-canvas', type: 'pixmap', rect: [0, 0, 200, 100] },
        { ...title, zOrder: 1 },
        { key: 'canvas', type: 'pixmap', rect: [16, 34, 136, 54], zOrder: 1 },
      ],
    },
  },
  {
    id: '$A1',
    name: '$A1 — Value',
    description: 'Title, icon, and a large value.',
    layout: { $schema: SCHEMA, id: '$A1', items: [title, icon48(16), value] },
  },
  {
    id: '$B1',
    name: '$B1 — Indicator',
    description: 'Title, icon, value, and a bar indicator.',
    layout: {
      $schema: SCHEMA,
      id: '$B1',
      items: [
        title,
        icon48(16),
        value,
        { key: 'indicator', type: 'bar', rect: [76, 74, 108, 12], value: 0, subtype: 4, border_w: 0 },
      ],
    },
  },
  {
    id: '$B2',
    name: '$B2 — Gradient indicator',
    description: 'Title, icon, value, and a gradient indicator.',
    layout: {
      $schema: SCHEMA,
      id: '$B2',
      items: [
        title,
        icon48(16),
        value,
        {
          key: 'indicator',
          type: 'gbar',
          rect: [76, 74, 108, 20],
          value: 0,
          subtype: 4,
          border_w: 0,
          bar_h: 12,
          bar_bg_c: '0:#ff0000,0.33:#a6d4ec,0.66:#f4b675,1:#00ff00',
        },
      ],
    },
  },
  {
    id: '$C1',
    name: '$C1 — Double indicator',
    description: 'Title with two icon + bar rows.',
    layout: {
      $schema: SCHEMA,
      id: '$C1',
      items: [
        title,
        { key: 'icon1', type: 'pixmap', rect: [16, 40, 24, 24] },
        { key: 'icon2', type: 'pixmap', rect: [16, 68, 24, 24] },
        { key: 'indicator1', type: 'bar', rect: [48, 46, 136, 12], value: 0, subtype: 4, border_w: 0 },
        { key: 'indicator2', type: 'bar', rect: [48, 74, 136, 12], value: 0, subtype: 4, border_w: 0 },
      ],
    },
  },
  {
    id: 'custom-plus',
    name: 'Docs demo',
    description: 'The custom layout example from the Elgato docs.',
    layout: {
      $schema: SCHEMA,
      id: 'custom-layout',
      controller: 'Encoder',
      items: [
        { type: 'pixmap', key: 'leading', rect: [10, 40, 20, 20] },
        { key: 'title', type: 'text', rect: [40, 40, 120, 20], font: { size: 20 } },
        { key: 'trailing', type: 'pixmap', rect: [170, 40, 20, 20] },
      ],
    },
  },
  {
    id: 'custom-neo',
    name: 'Docs demo',
    description: 'The Neo infobar example from the Elgato docs.',
    layout: {
      $schema: SCHEMA,
      id: 'neo',
      controller: 'Neo',
      items: [
        { type: 'pixmap', key: 'leading', rect: [10, 15, 20, 20] },
        { key: 'title', type: 'text', rect: [40, 15, 152, 20], font: { size: 15 } },
        { key: 'trailing', type: 'pixmap', rect: [202, 15, 20, 20] },
      ],
    },
  },
] as Template[];

export function templateSource(t: Template): string {
  return formatJson(t.layout);
}
