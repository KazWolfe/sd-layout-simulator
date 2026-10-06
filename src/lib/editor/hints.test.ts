import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { json } from '@codemirror/lang-json';
import { EditorState, type Extension } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { SCHEMA_URL } from '../layout/schema';
import type { LayoutItem } from '../layout/types';
import { layoutHints, payloadHints, toCmSnippet } from './hints';

/** Completions at `|` in `doc`: their displayed labels, and the options themselves. */
async function complete(extension: Extension, doc: string): Promise<{ labels: string[]; options: Completion[] }> {
  const pos = doc.indexOf('|');
  const state = EditorState.create({ doc: doc.replace('|', ''), extensions: [json(), extension] });
  const source = state.languageDataAt<(ctx: CompletionContext) => Promise<{ options: Completion[] } | null>>('autocomplete', pos)[0];
  const result = await source(new CompletionContext(state, pos, true));
  const options = result?.options ?? [];
  return { labels: options.map((o) => o.displayLabel ?? o.label), options };
}

const layout = layoutHints();
const item = (s: string) => `{ "$schema": "${SCHEMA_URL}", "controller": "Encoder", "items": [ ${s} ] }`;

describe('layout hints', () => {
  it('suggests root properties and controllers', async () => {
    expect((await complete(layout, '{ | }')).labels.sort()).toEqual(['$schema', 'controller', 'id', 'items']);
    expect((await complete(layout, '{ "controller": | }')).labels.sort()).toEqual(['"Encoder"', '"Neo"']);
  });

  it("suggests a typed item's properties", async () => {
    const text = (await complete(layout, item('{ "type": "text", | }'))).labels;
    expect(text).toContain('alignment');
    expect(text).not.toContain('bar_h');
    expect((await complete(layout, item('{ "type": "gbar", | }'))).labels).toContain('bar_h');
    expect((await complete(layout, item('{ "type": "bar", "range": { | } }'))).labels.sort()).toEqual(['max', 'min']);
    expect((await complete(layout, item('{ "type": "text", "alignment": | }'))).labels.sort()).toEqual(['"center"', '"left"', '"right"']);
  });

  it('offers only shared properties before an item has a type, narrowed by its keys', async () => {
    const untyped = (await complete(layout, item('{ "key": "a", | }'))).labels;
    expect(untyped).toEqual(expect.arrayContaining(['type', 'rect', 'zOrder', 'value']));
    expect(untyped).not.toContain('font');
    expect(untyped).not.toContain('bar_h');
    // `font` leaves only text; `range` leaves bar and gbar.
    expect((await complete(layout, item('{ "font": {}, | }'))).labels).toContain('alignment');
    const bars = (await complete(layout, item('{ "range": {}, | }'))).labels;
    expect(bars).toContain('bar_fill_c');
    expect(bars).not.toContain('bar_h');
  });

  it('offers every type, fitting ones first, noting what others drop', async () => {
    const { labels, options } = await complete(layout, item('{ "type": "|", "key": "a", "font": {} }'));
    expect(labels).toEqual(['"text"', '"bar"', '"gbar"', '"pixmap"']);
    expect(options[1].detail).toBe('drops font');
    expect((await complete(layout, item('{ "type": | }'))).labels.sort()).toEqual(['"bar"', '"gbar"', '"pixmap"', '"text"']);
  });

  it('does not suggest values for free-form strings', async () => {
    expect((await complete(layout, item('{ "type": "text", "key": "|" }'))).labels).toEqual([]);
  });
});

describe('payload hints', () => {
  const items = [
    { key: 'indicator', type: 'bar', rect: [0, 0, 10, 10] },
    { key: 'title', type: 'text', rect: [0, 0, 10, 10] },
  ] as LayoutItem[];
  const payload = payloadHints(() => items);

  it('suggests item keys and their mutable properties', async () => {
    expect((await complete(payload, '{ | }')).labels.sort()).toEqual(['indicator', 'title']);
    const bar = (await complete(payload, '{ "indicator": { | } }')).labels;
    expect(bar).toContain('bar_fill_c');
    expect(bar).not.toContain('rect');
    expect(bar).not.toContain('key');
    expect((await complete(payload, '{ "title": { | } }')).labels).toContain('font');
  });
});

describe('snippet conversion', () => {
  it('converts VS Code snippets to CodeMirror syntax', () => {
    expect(toCmSnippet('"alignment": $1')).toBe('"alignment": ${1}');
    expect(toCmSnippet('"font": {$1}')).toBe('"font": \\{${1}\\}');
    expect(toCmSnippet('"range": {\n\t"min": ${1:0}\n}')).toBe('"range": \\{\n\t"min": ${1:0}\n\\}');
    expect(toCmSnippet('${1|"a","b"|}')).toBe('${1:"a"}');
    expect(toCmSnippet('"\\$schema"$0')).toBe('"$schema"${0}');
  });
});
