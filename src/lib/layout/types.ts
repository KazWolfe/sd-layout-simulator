/**
 * Types mirroring the Elgato layout schema
 * (https://schemas.elgato.com/streamdeck/plugins/layout.json).
 */

export type Rect = [x: number, y: number, width: number, height: number];

export type ItemType = 'bar' | 'gbar' | 'pixmap' | 'text';

export interface Range {
  min: number;
  max: number;
}

interface BaseItem {
  key: string;
  rect: Rect;
  background?: string;
  enabled?: boolean;
  opacity?: number;
  zOrder?: number;
}

export interface BarItem extends BaseItem {
  type: 'bar';
  value?: number;
  range?: Range;
  subtype?: 0 | 1 | 2 | 3 | 4;
  bar_bg_c?: string;
  bar_fill_c?: string;
  bar_border_c?: string;
  border_w?: number;
}

export interface GBarItem extends Omit<BarItem, 'type'> {
  type: 'gbar';
  bar_h?: number;
}

export interface PixmapItem extends BaseItem {
  type: 'pixmap';
  value?: string;
}

export interface TextItem extends BaseItem {
  type: 'text';
  value?: string;
  alignment?: 'left' | 'center' | 'right';
  color?: string;
  font?: { size?: number; weight?: number };
  'text-overflow'?: 'clip' | 'ellipsis' | 'fade';
}

export type LayoutItem = BarItem | GBarItem | PixmapItem | TextItem;

export type Controller = 'Encoder' | 'Neo';

export interface Layout {
  $schema?: string;
  id: string;
  controller?: Controller;
  items: LayoutItem[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** Character offsets into the source text. */
  from: number;
  to: number;
  /** Index of the layout item the diagnostic relates to, if any. */
  itemIndex?: number;
  /** Another item involved in the problem (e.g. the other side of an overlap). */
  relatedIndex?: number;
  /**
   * True when Stream Deck itself would refuse to render the layout because of
   * this problem (out of bounds, overlap on the same zOrder, …).
   */
  blocksRender?: boolean;
}
