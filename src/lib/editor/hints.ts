import { snippet, startCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { jsonLanguage } from '@codemirror/lang-json';
import type { Extension } from '@codemirror/state';
import { EditorView, hoverTooltip } from '@codemirror/view';
import { getLocation, type JSONPath } from 'jsonc-parser';
import {
  ClientCapabilities,
  CompletionItemKind,
  getLanguageService,
  InsertTextFormat,
  TextDocument,
  type CompletionItem,
  type JSONSchema,
  type MarkedString,
  type MarkupContent,
} from 'vscode-json-languageservice';
import { parseSource } from '../layout/parse';
import { controllerModel, resolveRef, schema, SCHEMA_URL, type ItemModel } from '../layout/schema';
import type { ItemType, LayoutItem } from '../layout/types';
import { isObj } from '../util';

/**
 * Type hints for the JSON editors: completion and hover docs from
 * vscode-json-languageservice, evaluated against a JSON schema. The layout
 * editor uses the layout schema; the payload editor a schema generated from
 * the layout's items.
 */

interface CompletionScope {
  text: string;
  /** Parsed (possibly partial) document. */
  value: unknown;
  /** Path of the property or value at the cursor. */
  path: JSONPath;
  isAtPropertyKey: boolean;
}

interface HintOptions {
  /** URI the schema is registered under; a document's `$schema` resolves against it. */
  uri: string;
  /** The current schema. Called on every request; return the same object while it is unchanged. */
  schema: () => JSONSchema;
  /** Adjusts the language service's completions: removes, reorders, or annotates them, never adds. */
  refine?: (items: CompletionItem[], scope: CompletionScope) => CompletionItem[];
}

function service(options: HintOptions) {
  const ls = getLanguageService({
    clientCapabilities: ClientCapabilities.LATEST,
    // Everything is registered up front; never fetch.
    schemaRequestService: (uri) => Promise.reject(`Not loading ${uri}`),
  });
  let configured: JSONSchema | undefined;
  let version = 0;
  return (text: string) => {
    const current = options.schema();
    if (current !== configured) {
      ls.configure({ validate: false, schemas: [{ uri: options.uri, fileMatch: ['*'], schema: current }] });
      configured = current;
    }
    const doc = TextDocument.create('inmemory://editor.json', 'json', ++version, text);
    return { ls, doc, json: ls.parseJSONDocument(doc) };
  };
}

/** Escapes literal text for a CodeMirror snippet, where only `\{` and `\}` are escapes. */
const cmLiteral = (text: string) => text.replace(/[{}]/g, '\\$&');

/** Converts a VS Code snippet (`$1`, `${1:x}`, `${1|a,b|}`, `\$`) to CodeMirror's syntax. */
export function toCmSnippet(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) {
      out += cmLiteral(text[++i]);
      continue;
    }
    if (c === '$') {
      const m = /^\$(\d+)|^\$\{(\d+)(?::((?:\\.|[^}\\])*)|\|([^|]*)\|)?\}/.exec(text.slice(i));
      if (m) {
        const n = m[1] ?? m[2];
        // CodeMirror placeholders can't contain braces.
        const placeholder = (m[3]?.replace(/\\(.)/g, '$1') ?? m[4]?.split(',')[0] ?? '').replace(/[{}]/g, '');
        out += placeholder ? `\${${n}:${placeholder}}` : `\${${n}}`;
        i += m[0].length - 1;
        continue;
      }
    }
    out += cmLiteral(c);
  }
  return out;
}

const documentation = (d: CompletionItem['documentation']) => (typeof d === 'string' ? d : d?.value);

const kindType = (kind: CompletionItemKind | undefined) =>
  kind === CompletionItemKind.Property ? 'property' : kind === CompletionItemKind.Value || kind === CompletionItemKind.EnumMember ? 'constant' : 'text';

function completionSource(options: HintOptions, open: ReturnType<typeof service>) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const token = ctx.matchBefore(/"?[^\s"{}[\],:]*/);
    if (!ctx.explicit && (!token || token.from === token.to)) return null;

    const text = ctx.state.doc.toString();
    const { ls, doc, json } = open(text);
    const list = await ls.doComplete(doc, doc.positionAt(ctx.pos), json);
    if (ctx.aborted || !list?.items.length) return null;

    const loc = getLocation(text, ctx.pos);
    const scope: CompletionScope = { text, value: parseSource(text).value, path: loc.path, isAtPropertyKey: loc.isAtPropertyKey };
    const items = options.refine ? options.refine(list.items, scope) : list.items;
    if (!items.length) return null;

    // Items share one replace range: from its start up to (or past) the cursor.
    const edit = (i: CompletionItem) => (i.textEdit && 'range' in i.textEdit ? i.textEdit : undefined);
    const first = edit(items[0]);
    const from = first ? doc.offsetAt(first.range.start) : ctx.pos;
    const options_: Completion[] = items.map((item, i) => {
      const e = edit(item);
      const insert = e?.newText ?? item.insertText ?? item.label;
      const endPastCursor = e ? Math.max(0, doc.offsetAt(e.range.end) - ctx.pos) : 0;
      const docs = documentation(item.documentation);
      return {
        // Matched against the typed text, which includes the opening quote.
        label: item.filterText ?? item.label,
        displayLabel: item.label,
        detail: item.detail,
        info: docs ? () => markdown(docs) : undefined,
        type: kindType(item.kind),
        // Keep the language service's order.
        boost: -i / items.length,
        apply: (view, completion, applyFrom, to) => {
          const end = Math.min(view.state.doc.length, to + endPastCursor);
          const template = item.insertTextFormat === InsertTextFormat.Snippet ? toCmSnippet(insert) : cmLiteral(insert);
          snippet(template)(view, completion, applyFrom, end);
          if (item.command?.command === 'editor.action.triggerSuggest') queueMicrotask(() => startCompletion(view));
        },
      };
    });
    return { from, options: options_ };
  };
}

function hoverSource(open: ReturnType<typeof service>) {
  return hoverTooltip(async (view, pos) => {
    const { ls, doc, json } = open(view.state.doc.toString());
    const hover = await ls.doHover(doc, doc.positionAt(pos), json);
    if (!hover) return null;
    const contents = (Array.isArray(hover.contents) ? hover.contents : [hover.contents]) as (MarkupContent | MarkedString)[];
    const text = contents
      .map((c) => (typeof c === 'string' ? c : 'language' in c ? '```\n' + c.value + '\n```' : c.value))
      .filter(Boolean)
      .join('\n\n');
    if (!text) return null;
    return {
      pos: hover.range ? doc.offsetAt(hover.range.start) : pos,
      end: hover.range ? doc.offsetAt(hover.range.end) : pos,
      above: true,
      create: () => ({ dom: markdown(text) }),
    };
  });
}

/** Renders the schema's (simple) markdown: paragraphs, lists, code, emphasis. */
function markdown(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cm-hint';
  const inline = (parent: HTMLElement, s: string) => {
    for (const part of s.split(/(`[^`]+`|\*\*[^*]+\*\*)/)) {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 1) parent.append(Object.assign(document.createElement('code'), { textContent: part.slice(1, -1) }));
      else if (part.startsWith('**') && part.endsWith('**') && part.length > 3) parent.append(Object.assign(document.createElement('strong'), { textContent: part.slice(2, -2) }));
      else parent.append(part);
    }
  };
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n');
    if (block.startsWith('```')) {
      el.append(Object.assign(document.createElement('pre'), { textContent: lines.slice(1, lines.at(-1) === '```' ? -1 : undefined).join('\n') }));
    } else if (lines.every((l) => /^\s*[-*] /.test(l))) {
      const ul = el.appendChild(document.createElement('ul'));
      for (const l of lines) inline(ul.appendChild(document.createElement('li')), l.replace(/^\s*[-*] /, ''));
    } else {
      inline(el.appendChild(document.createElement('p')), lines.join(' '));
    }
  }
  return el;
}

function hints(options: HintOptions): Extension {
  const open = service(options);
  return [
    jsonLanguage.data.of({ autocomplete: completionSource(options, open) }),
    hoverSource(open),
    EditorView.baseTheme({
      '.cm-hint': { maxWidth: '360px', padding: '2px 8px', fontSize: '12px', lineHeight: '1.45' },
      '.cm-hint p, .cm-hint ul, .cm-hint pre': { margin: '4px 0' },
      '.cm-hint ul': { paddingLeft: '18px' },
      '.cm-hint code, .cm-hint pre': { fontFamily: 'var(--mono)' },
    }),
  ];
}

// Layout editor

/**
 * Item types an item could still be. Item schemas are closed
 * (additionalProperties: false), so each property already set rules out the
 * types without it; e.g. `font` leaves only text. Unknown keys (typos, or the
 * name being typed) don't narrow.
 */
export function candidateTypes(items: Record<ItemType, ItemModel>, item: Record<string, unknown>): ItemModel[] {
  const models = Object.values(items);
  const keys = Object.keys(item).filter((k) => k !== 'type' && models.some((m) => k in m.properties));
  const fits = models.filter((m) => keys.every((k) => k in m.properties));
  // Nothing fits (conflicting properties): don't narrow at all.
  return fits.length ? fits : models;
}

/**
 * `controller` and `type` select a schema branch, and the language service
 * fills in the first branch's value (e.g. `"type": "bar"`). Insert them empty
 * and list the values instead.
 */
function askForValue(completion: CompletionItem): CompletionItem {
  const insert = `${JSON.stringify(completion.label)}: $1`;
  const textEdit = completion.textEdit && { ...completion.textEdit, newText: insert };
  return { ...completion, insertText: insert, textEdit, command: { title: 'Suggest', command: 'editor.action.triggerSuggest' } };
}

const askForValueOf = (name: string) => (c: CompletionItem) => (c.kind === CompletionItemKind.Property && c.label === name ? askForValue(c) : c);

/**
 * The language service offers every type's properties until an item has a
 * valid type. Narrow that to the properties all its candidate types share, and
 * order `type` values so the candidates come first.
 */
function refineLayout(completions: CompletionItem[], { value, path, isAtPropertyKey }: CompletionScope): CompletionItem[] {
  if (path.length === 1 && isAtPropertyKey) return completions.map(askForValueOf('controller'));
  if (path[0] !== 'items' || typeof path[1] !== 'number' || path.length !== 3 || !isObj(value) || !Array.isArray(value.items)) return completions;
  const item = isObj(value.items[path[1]]) ? (value.items[path[1]] as Record<string, unknown>) : {};
  const { items } = controllerModel(value.controller);
  const candidates = candidateTypes(items, item);

  if (isAtPropertyKey) {
    if (items[item.type as ItemType]) return completions.map(askForValueOf('type'));
    const shared = (name: string) => candidates.every((m) => name in m.properties);
    return completions.filter((c) => c.kind !== CompletionItemKind.Property || shared(c.label)).map(askForValueOf('type'));
  }

  if (path[2] === 'type') {
    // Switching to a type outside the candidates would make some properties invalid; say which.
    const known = Object.keys(item).filter((k) => Object.values(items).some((m) => k in m.properties));
    const rank = (c: CompletionItem) => {
      const i = candidates.findIndex((m) => JSON.stringify(m.type) === c.label);
      return i < 0 ? candidates.length : i;
    };
    return [...completions]
      .sort((a, b) => rank(a) - rank(b))
      .map((c) => {
        const model = Object.values(items).find((m) => JSON.stringify(m.type) === c.label);
        const drops = model && !candidates.includes(model) ? known.filter((k) => !(k in model.properties)) : [];
        return drops.length ? { ...c, detail: `drops ${drops.join(', ')}` } : c;
      });
  }
  return completions;
}

/** Hints for layout JSON. */
export function layoutHints(): Extension {
  return hints({ uri: SCHEMA_URL, schema: () => schema().raw, refine: refineLayout });
}

// Payload editor

/**
 * Schema for setFeedback payloads: each item's key maps to its value, or to an
 * object of the properties setFeedback can change. Built from the layout
 * schema's item definitions.
 */
export function payloadSchema(items: LayoutItem[], controller?: unknown): JSONSchema {
  const raw = schema().raw;
  const model = controllerModel(controller);
  const properties = Object.fromEntries(
    items
      .filter((item) => model.items[item.type])
      .map((item) => {
        const spec = model.items[item.type];
        const def = resolveRef(raw, spec.ref);
        const mutable = Object.fromEntries(Object.entries<JSONSchema>(def.properties).filter(([k]) => !spec.properties[k]?.immutable));
        const description = `${item.type} item at [${item.rect.join(', ')}]. Set it to its value, or to an object of properties to change.`;
        const value = def.properties.value as JSONSchema | undefined;
        const patch: JSONSchema = { type: 'object', additionalProperties: false, properties: mutable };
        return [item.key, { description, anyOf: value ? [value, patch] : [patch] } satisfies JSONSchema];
      }),
  );
  return { definitions: raw.definitions, type: 'object', additionalProperties: false, properties };
}

/** Hints for setFeedback payloads, based on the current layout's items. */
export function payloadHints(items: () => LayoutItem[], controller: () => unknown = () => undefined): Extension {
  let cached: { signature: string; schema: JSONSchema } | undefined;
  const current = () => {
    const list = items();
    const signature = JSON.stringify([schema().id, schema().source, controller(), list.map((i) => [i.key, i.type, i.rect])]);
    if (cached?.signature !== signature) cached = { signature, schema: payloadSchema(list, controller()) };
    return cached.schema;
  };
  return hints({ uri: 'inmemory://setFeedback.schema.json', schema: current });
}
