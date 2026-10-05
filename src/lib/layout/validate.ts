import type { Node } from 'jsonc-parser';
import { isObj } from '../util';
import { colorToCss, paintToCss } from './color';
import { deviceForController, type Device } from './devices';
import { keyRangeAt, rangeAt } from './parse';
import { controllerModel, SCHEMA_URL, schema, type PropSchema } from './schema';
import type { Diagnostic, ItemType, Layout, LayoutItem, Rect, Severity } from './types';

/**
 * Layout validation. Property rules (types, enums, ranges, patterns, required
 * and allowed properties) come from the layout schema; this module adds the
 * checks the schema can't express: canvas bounds, overlaps, duplicate keys,
 * color syntax, and range ordering.
 */

export interface ValidationResult {
  device: Device;
  /** Renderable layout (items lacking a valid type/rect are dropped). */
  layout: Layout | null;
  /** For each renderable item, its index in the source `items` array. */
  sourceIndex: number[];
  diagnostics: Diagnostic[];
}

const list = (values: unknown[]) => values.map((v) => JSON.stringify(v)).join(', ');

/** Checks a value against a property's schema; returns a problem description or null. */
export function checkValue(prop: PropSchema, v: unknown): string | null {
  if (prop.const !== undefined && v !== prop.const) return `must be ${JSON.stringify(prop.const)}`;
  if (prop.enum && !prop.enum.includes(v)) return `must be one of ${list(prop.enum)}`;

  switch (prop.type) {
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'must be a number';
      if (prop.minimum !== undefined && prop.maximum !== undefined && (v < prop.minimum || v > prop.maximum))
        return `must be between ${prop.minimum} and ${prop.maximum}`;
      if (prop.minimum !== undefined && v < prop.minimum) return `must be at least ${prop.minimum}`;
      if (prop.maximum !== undefined && v > prop.maximum) return `must be at most ${prop.maximum}`;
      break;
    case 'string':
      if (typeof v !== 'string') return 'must be a string';
      if (prop.pattern && !prop.pattern.test(v)) return prop.patternMessage ? `is invalid: ${prop.patternMessage}` : `must match ${prop.pattern}`;
      if (prop.color && (prop.color === 'gradient' ? paintToCss(v) : colorToCss(v)) === null) {
        return prop.color === 'gradient'
          ? `"${v}" is not a valid color or gradient (expected a named color, #hex, or "0:#f00,1:#0f0")`
          : `"${v}" is not a valid color (gradients are not supported here)`;
      }
      break;
    case 'boolean':
      if (typeof v !== 'boolean') return 'must be a boolean';
      break;
    case 'array':
      if (!Array.isArray(v)) return 'must be an array';
      if (prop.tuple) {
        if (v.length !== prop.tuple.length) return `must be [${prop.tuple.map((t) => t.name).join(', ')}]`;
        for (let i = 0; i < prop.tuple.length; i++) {
          const problem = checkValue(prop.tuple[i], v[i]);
          if (problem) return `${prop.tuple[i].name} ${problem}`;
        }
      }
      break;
    case 'object': {
      if (!isObj(v)) return 'must be an object';
      const props = prop.properties ?? {};
      if (prop.additionalProperties === false) {
        const extra = Object.keys(v).filter((k) => !(k in props));
        if (extra.length) return `has unknown properties: ${extra.join(', ')}`;
      }
      const missing = (prop.required ?? []).filter((k) => !(k in v));
      if (missing.length) return `requires ${list(missing)}`;
      for (const [k, sub] of Object.entries(v)) {
        const problem = props[k] && checkValue(props[k], sub);
        if (problem) return `"${k}" ${problem}`;
      }
      // Not expressible in the schema: a range's min must be below its max.
      if ('min' in props && 'max' in props && typeof v.min === 'number' && typeof v.max === 'number' && v.min >= v.max) {
        return '"min" must be less than "max"';
      }
      break;
    }
  }
  return null;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

/**
 * Validates a parsed layout. The canvas comes from the layout's `controller`,
 * unless the preview overrides it (only offered when there is no controller).
 */
export function validateLayout(value: unknown, tree: Node | undefined, deviceOverride?: Device | null): ValidationResult {
  const deviceFor = (controller: unknown) => deviceOverride ?? deviceForController(controller);
  const diagnostics: Diagnostic[] = [];
  const add = (severity: Severity, message: string, path: (string | number)[], extra: Partial<Diagnostic> = {}) =>
    diagnostics.push({ severity, message, ...rangeAt(tree, path), ...extra });
  const addAtKey = (severity: Severity, message: string, path: (string | number)[], extra: Partial<Diagnostic> = {}) =>
    diagnostics.push({ severity, message, ...keyRangeAt(tree, path), ...extra });

  if (!isObj(value)) {
    if (value !== undefined) add('error', 'Layout must be a JSON object.', []);
    return { device: deviceFor(undefined), layout: null, sourceIndex: [], diagnostics };
  }

  // Root
  const controllers = schema().controllers.map((c) => c.controller);
  if (value.controller !== undefined && !controllers.includes(value.controller as never)) {
    add('error', `"controller" must be one of ${list(controllers)}.`, ['controller']);
  }
  const model = controllerModel(value.controller);
  const device = deviceFor(value.controller);

  for (const k of model.root.required) {
    if (!(k in value)) add('error', `Layout is missing required property "${k}".`, []);
  }
  for (const [k, v] of Object.entries(value)) {
    const prop = model.root.properties[k];
    if (!prop) addAtKey('error', `Unknown layout property "${k}".`, [k]);
    else if (k !== 'controller' && k !== 'items') {
      const problem = checkValue(prop, v);
      if (problem) add('error', `"${k}" ${problem}.`, [k]);
    }
  }
  if (deviceOverride && (device.width !== model.canvas.width || device.height !== model.canvas.height)) {
    add(
      'warning',
      `Previewing on ${deviceOverride.id === 'custom' ? 'a custom' : `the ${deviceOverride.name}`} ${device.width}×${device.height} canvas, but without a valid "controller" Stream Deck treats this as an ${JSON.stringify(model.controller)} layout (${model.canvas.width}×${model.canvas.height}) per the schema. Bounds are checked against the preview size.`,
      [],
    );
  }
  if (value.$schema === undefined) {
    add('warning', `Layout has no "$schema"; add "$schema": "${SCHEMA_URL}".`, []);
  } else if (value.$schema !== SCHEMA_URL) {
    add('warning', `"$schema" should be "${SCHEMA_URL}".`, ['$schema']);
  }

  if (!Array.isArray(value.items)) {
    if (value.items !== undefined) add('error', '"items" must be an array.', ['items']);
    return { device, layout: null, sourceIndex: [], diagnostics };
  }

  // Items
  const itemTypes = Object.keys(model.items);
  const items: LayoutItem[] = [];
  const sourceIndex: number[] = [];
  const keys = new Map<string, number>();

  value.items.forEach((raw, i) => {
    const at = (...p: (string | number)[]) => ['items', i, ...p];
    const itemDiag = (severity: Severity, message: string, path: (string | number)[], extra: Partial<Diagnostic> = {}) =>
      add(severity, message, path, { itemIndex: i, ...extra });

    if (!isObj(raw)) {
      itemDiag('error', 'Layout item must be an object.', at());
      return;
    }

    const type = raw.type;
    const spec = typeof type === 'string' && itemTypes.includes(type) ? model.items[type as ItemType] : undefined;
    if (type !== undefined && !spec) itemDiag('error', `Unknown item type ${JSON.stringify(type)}; expected one of ${list(itemTypes)}.`, at('type'));

    for (const k of spec?.required ?? ['key', 'rect', 'type']) {
      if (!(k in raw)) itemDiag('error', `Item is missing required property "${k}".`, at());
    }

    // Duplicate keys
    if (typeof raw.key === 'string') {
      const prev = keys.get(raw.key);
      if (prev !== undefined) itemDiag('error', `Duplicate key "${raw.key}" (also used by item ${prev}).`, at('key'));
      else keys.set(raw.key, i);
    }

    // rect: shape from the schema; bounds are checked against the whole canvas.
    let rect: Rect | null = null;
    const rectSchema = spec?.properties.rect ?? model.items.text.properties.rect;
    if (raw.rect !== undefined) {
      const len = rectSchema.tuple?.length ?? 4;
      if (!Array.isArray(raw.rect) || raw.rect.length !== len || !raw.rect.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        itemDiag('error', `"rect" must be [${rectSchema.tuple?.map((t) => t.name).join(', ')}] with ${len} numbers.`, at('rect'));
      } else {
        rect = raw.rect as Rect;
        const [x, y, w, h] = rect;
        if (rectSchema.tuple?.some((t, j) => t.minimum !== undefined && rect![j] < t.minimum)) {
          itemDiag('error', '"rect" values must not be negative. Stream Deck will not render this layout.', at('rect'), { blocksRender: true });
        } else if (x + w > device.width || y + h > device.height) {
          itemDiag(
            'error',
            `Item extends outside the ${device.width}×${device.height} ${device.name} canvas (right edge ${x + w}, bottom edge ${y + h}). Stream Deck will not render this layout.`,
            at('rect'),
            { blocksRender: true },
          );
        }
      }
    }

    // Other properties
    if (spec) {
      for (const [k, v] of Object.entries(raw)) {
        if (k === 'rect') continue;
        const prop = spec.properties[k];
        if (!prop) {
          addAtKey('error', `Unknown property "${k}" for ${type} items.`, at(k), { itemIndex: i });
          continue;
        }
        const problem = checkValue(prop, v);
        if (problem) itemDiag('error', `"${k}" ${problem}.`, at(k));
      }
      if (raw.key === 'title') {
        const overridden = Object.values(spec.properties).filter((p) => p.titleOverridden && p.name in raw);
        if (overridden.length) {
          itemDiag(
            'info',
            `For the "title" item, ${overridden.map((p) => `"${p.name}"`).join(', ')} ${overridden.length === 1 ? 'is' : 'are'} ignored in favour of the user's title settings in the property inspector.`,
            at(overridden[0].name),
          );
        }
      }
    }

    if (spec && rect && typeof raw.key === 'string') {
      items.push(raw as unknown as LayoutItem);
      sourceIndex.push(i);
    }
  });

  // Overlaps within the same zOrder
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const za = items[a].zOrder ?? 0;
      const zb = items[b].zOrder ?? 0;
      if (za === zb && rectsOverlap(items[a].rect, items[b].rect)) {
        add(
          'error',
          `"${items[b].key}" overlaps "${items[a].key}" on zOrder ${za}. Items on the same zOrder must not overlap; Stream Deck will not render this layout.`,
          ['items', sourceIndex[b], 'rect'],
          { itemIndex: sourceIndex[b], relatedIndex: sourceIndex[a], blocksRender: true },
        );
      }
    }
  }

  return {
    device,
    layout: { ...(value as unknown as Layout), items },
    sourceIndex,
    diagnostics,
  };
}
