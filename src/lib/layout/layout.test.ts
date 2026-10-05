import { describe, expect, it } from 'vitest';
import { paintToCss, colorToCss } from './color';
import { setAtPath } from './edit';
import { applyFeedback, normalizeFeedback } from './feedback';
import { formatJson } from './format';
import { itemIndexAtOffset, parseSource } from './parse';
import { TEMPLATES, templateSource } from './templates';
import type { LayoutItem } from './types';
import { validateLayout } from './validate';

function check(source: string) {
  const parsed = parseSource(source);
  const result = validateLayout(parsed.value, parsed.tree);
  return { ...result, diagnostics: [...parsed.diagnostics, ...result.diagnostics] };
}

const layout = (items: unknown[], extra: object = {}) => JSON.stringify({ id: 'x', items, ...extra });

describe('templates', () => {
  it.each(TEMPLATES)('$id has no errors', (t) => {
    const { diagnostics } = check(templateSource(t));
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('validateLayout', () => {
  it('reports JSON syntax errors with offsets', () => {
    const { diagnostics } = check('{ "id": "x", "items": [ }');
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toMatch(/syntax/);
  });

  it('detects items outside the device bounds per controller', () => {
    const items = [{ key: 'a', type: 'text', rect: [0, 0, 220, 20] }];
    expect(check(layout(items)).diagnostics.some((d) => d.blocksRender)).toBe(true);
    expect(check(layout(items, { controller: 'Neo' })).diagnostics.some((d) => d.blocksRender)).toBe(false);
    expect(check(layout(items, { controller: 'Neo' })).device.id).toBe('neo');
  });

  it('uses a preview device override when given', async () => {
    const { customDevice, presetDevice } = await import('./devices');
    const parsed = parseSource(layout([{ key: 'a', type: 'text', rect: [0, 0, 300, 20] }]));
    expect(validateLayout(parsed.value, parsed.tree).diagnostics.some((d) => d.blocksRender)).toBe(true);
    const custom = validateLayout(parsed.value, parsed.tree, customDevice(undefined, { width: 400, height: 40 }));
    expect(custom.device).toMatchObject({ id: 'custom', width: 400, height: 40 });
    expect(custom.diagnostics.some((d) => d.blocksRender)).toBe(false);
    expect(custom.diagnostics.some((d) => /Previewing on a custom 400×40 canvas/.test(d.message))).toBe(true);
    // Previewing a controller-less layout on Neo differs from the schema's Encoder default.
    const neo = validateLayout(parsed.value, parsed.tree, presetDevice('neo'));
    expect(neo.diagnostics.some((d) => /Previewing on the Stream Deck Neo 232×50/.test(d.message))).toBe(true);
    // Matching the real size is not a mismatch.
    const same = validateLayout(parsed.value, parsed.tree, customDevice(undefined, { width: 200, height: 100 }));
    expect(same.diagnostics.some((d) => /Previewing on/.test(d.message))).toBe(false);
  });

  it('detects overlap only on the same zOrder', () => {
    const a = { key: 'a', type: 'pixmap', rect: [0, 0, 50, 50] };
    const b = { key: 'b', type: 'pixmap', rect: [40, 40, 50, 50] };
    expect(check(layout([a, b])).diagnostics.find((d) => /overlaps/.test(d.message))?.itemIndex).toBe(1);
    expect(check(layout([a, { ...b, zOrder: 1 }])).diagnostics.some((d) => /overlaps/.test(d.message))).toBe(false);
    // Touching edges is not overlapping.
    expect(check(layout([a, { ...b, rect: [50, 0, 10, 10] }])).diagnostics.some((d) => /overlaps/.test(d.message))).toBe(false);
  });

  it('flags duplicate keys, bad keys, unknown properties, and bad enums', () => {
    const msgs = check(
      layout([
        { key: 'a', type: 'text', rect: [0, 0, 10, 10] },
        { key: 'a', type: 'text', rect: [20, 0, 10, 10], alignment: 'middle' },
        { key: 'b c', type: 'bar', rect: [40, 0, 10, 10], value: 1, colour: 'red', opacity: 0.25 },
      ]),
    ).diagnostics.map((d) => d.message);
    expect(msgs.some((m) => /Duplicate key "a"/.test(m))).toBe(true);
    expect(msgs.some((m) => /"alignment" must be one of/.test(m))).toBe(true);
    expect(msgs.some((m) => /"key" is invalid: String must only contain/.test(m))).toBe(true);
    expect(msgs.some((m) => /Unknown property "colour"/.test(m))).toBe(true);
    expect(msgs.some((m) => /"opacity" must be one of/.test(m))).toBe(true);
  });

  it('points diagnostics at the offending source range', () => {
    const src = '{\n  "id": "x",\n  "items": [{ "key": "a", "type": "text", "rect": [0, 0, 999, 10] }]\n}';
    const d = check(src).diagnostics.find((x) => x.blocksRender)!;
    expect(src.slice(d.from, d.to)).toBe('"rect": [0, 0, 999, 10]');
  });
});

describe('schema', async () => {
  const { schema, itemDefaults, defaultRange, itemModel } = await import('./schema');

  it('derives canvas sizes, defaults, and runtime rules from the schema', () => {
    expect(Object.fromEntries(schema().controllers.map((c) => [c.controller, c.canvas]))).toEqual({
      Encoder: { width: 200, height: 100 },
      Neo: { width: 232, height: 50 },
    });
    expect(itemDefaults('bar')).toMatchObject({ bar_bg_c: 'darkGray', border_w: 2, subtype: 4, opacity: 1 });
    expect(defaultRange()).toEqual({ min: 0, max: 100 });
    const bar = itemModel('bar');
    expect(bar.required).toContain('value');
    expect(Object.values(bar.properties).filter((p) => p.immutable).map((p) => p.name).sort()).toEqual(['key', 'rect', 'type']);
    expect(bar.properties.subtype.optionNames.get(4)).toBe('Groove');
  });

  it('warns about a missing or unexpected $schema', () => {
    const msgs = (extra: object) => check(JSON.stringify({ id: 'x', items: [], ...extra })).diagnostics.filter((d) => d.severity === 'warning');
    expect(msgs({})).toHaveLength(1);
    expect(msgs({ $schema: 'https://example.com/layout.json' })).toHaveLength(1);
    expect(msgs({ $schema: 'https://schemas.elgato.com/streamdeck/plugins/layout.json' })).toHaveLength(0);
  });
});

describe('parse', () => {
  it('maps offsets to item indices', () => {
    const src = templateSource(TEMPLATES[0]);
    const parsed = parseSource(src);
    expect(itemIndexAtOffset(parsed.tree, src.indexOf('"icon"'))).toBe(1);
    expect(itemIndexAtOffset(parsed.tree, 0)).toBe(-1);
  });
});

describe('color', () => {
  it('converts colors and gradients', () => {
    expect(colorToCss('darkGray')).toBe('darkgray');
    expect(colorToCss('#80ff0000')).toBe('#ff000080');
    expect(colorToCss('nope')).toBeNull();
    expect(paintToCss('0:#ff0000,1:blue')).toBe('linear-gradient(to right, #ff0000 0%, blue 100%)');
    expect(paintToCss('0:#ff0000,2:blue')).toBeNull();
  });
});

describe('feedback', () => {
  const items = [
    { key: 'title', type: 'text', rect: [0, 0, 10, 10] },
    { key: 'indicator', type: 'bar', rect: [0, 20, 10, 10], value: 0, font: undefined },
  ] as LayoutItem[];

  it('accepts implicit and explicit values', () => {
    const { patches, warnings } = normalizeFeedback(
      { title: 'Hi', indicator: { value: 50, range: { min: 0, max: 200 } }, missing: 1 },
      items,
    );
    expect(patches).toEqual({ title: { value: 'Hi' }, indicator: { value: 50, range: { min: 0, max: 200 } } });
    expect(warnings).toEqual([{ message: 'No layout item has key "missing"; ignored.', path: ['missing'] }]);
  });

  it('rejects immutable and mistyped properties', () => {
    const { patches, warnings } = normalizeFeedback({ title: { rect: [0, 0, 1, 1], color: 'red' }, indicator: 'x' }, items);
    expect(patches).toEqual({ title: { color: 'red' } });
    expect(warnings.map((w) => w.path)).toEqual([['title', 'rect'], ['indicator']]);
  });

  it('applies a payload without touching immutable properties', () => {
    const { patches } = normalizeFeedback({ title: { value: 'A', color: 'red' }, indicator: 30 }, items);
    const applied = applyFeedback(items, patches);
    expect(applied[0]).toMatchObject({ value: 'A', color: 'red' });
    expect(applied[1]).toMatchObject({ value: 30, rect: [0, 20, 10, 10] });
  });
});

describe('edit', () => {
  it('modifies values without reformatting', () => {
    const src = formatJson({ id: 'x', items: [{ key: 'a', type: 'text', rect: [0, 0, 10, 10] }] });
    const out = setAtPath(src, ['items', 0, 'rect'], [5, 5, 10, 10]);
    expect(JSON.parse(out).items[0].rect).toEqual([5, 5, 10, 10]);
    const added = setAtPath(src, ['controller'], 'Neo');
    expect(JSON.parse(added).controller).toBe('Neo');
    expect(added).toContain('"rect": [0, 0, 10, 10]');
  });
});

describe('hints', async () => {
  const { layoutHints, payloadHints } = await import('../editor/hints');

  it('suggests properties for the item type at a path', () => {
    const value = { id: 'x', items: [{ type: 'text' }, { type: 'gbar' }] };
    expect(Object.keys(layoutHints.properties([], value)!).sort()).toEqual(['$schema', 'controller', 'id', 'items']);
    // Every controller is offered, even though each schema branch allows only its own.
    expect(layoutHints.properties([], value)!.controller.enum?.slice().sort()).toEqual(['Encoder', 'Neo']);
    expect(layoutHints.properties(['items', 0], value)).toHaveProperty('alignment');
    expect(layoutHints.properties(['items', 0], value)).not.toHaveProperty('bar_h');
    expect(layoutHints.properties(['items', 1], value)).toHaveProperty('bar_h');
    expect(Object.keys(layoutHints.properties(['items', 1, 'range'], value)!)).toEqual(['min', 'max']);
  });

  it('suggests item keys and mutable properties for payloads', () => {
    const items = [{ key: 'indicator', type: 'bar', rect: [0, 0, 10, 10] }] as LayoutItem[];
    const hints = payloadHints(() => items);
    expect(Object.keys(hints.properties([], {})!)).toEqual(['indicator']);
    const props = Object.keys(hints.properties(['indicator'], {})!);
    expect(props).toContain('bar_fill_c');
    expect(props).not.toContain('rect');
    expect(hints.properties(['missing'], {})).toBeNull();
  });
});
