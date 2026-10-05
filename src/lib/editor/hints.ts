import { snippet, startCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { jsonLanguage } from '@codemirror/lang-json';
import type { Extension } from '@codemirror/state';
import { EditorView, hoverTooltip } from '@codemirror/view';
import { findNodeAtLocation, findNodeAtOffset, getLocation, getNodePath, type JSONPath, type Node } from 'jsonc-parser';
import { defaultLabel, snippetFor, typeLabel, valueOptions } from '../layout/docs';
import { parseSource } from '../layout/parse';
import { presetDevices } from '../layout/devices';
import { controllerModel, itemModel, schema, type PropSchema } from '../layout/schema';
import type { ItemType, LayoutItem } from '../layout/types';
import { isObj } from '../util';

/**
 * Type hints for the JSON editors: context-aware autocompletion and hover docs,
 * driven by the layout schema. A HintProvider says which properties exist at
 * each object path.
 */
export interface HintProvider {
  /** Properties of the object at `path`, given the (possibly partial) document value. */
  properties(path: JSONPath, value: unknown): Record<string, PropSchema> | null;
}

/** Follows `path` through nested object properties (e.g. font → size). */
function descend(props: Record<string, PropSchema> | null, path: JSONPath): Record<string, PropSchema> | null {
  for (const seg of path) props = (typeof seg === 'string' && props?.[seg]?.properties) || null;
  return props;
}

/**
 * Root properties. Each schema branch fixes `controller` to one value; offer
 * all of them, named after their devices.
 */
function rootProperties(props: Record<string, PropSchema>): Record<string, PropSchema> {
  const controller = props.controller;
  if (!controller) return props;
  const devices = presetDevices();
  const values = schema().controllers.map((c) => c.controller);
  const optionNames = new Map<unknown, string>(
    values.map((v) => {
      const d = devices.find((d) => d.controller === v);
      return [v, d ? `${d.name}, ${d.width}×${d.height}` : String(v)];
    }),
  );
  return { ...props, controller: { ...controller, const: undefined, enum: values, optionNames } };
}

/** Hints for layout JSON. */
export const layoutHints: HintProvider = {
  properties(path, value) {
    const model = controllerModel(isObj(value) ? value.controller : undefined);
    if (path.length === 0) return rootProperties(model.root.properties);
    if (path[0] !== 'items' || typeof path[1] !== 'number') return null;
    const items = isObj(value) && Array.isArray(value.items) ? value.items : [];
    const type = isObj(items[path[1]]) ? (items[path[1]] as Record<string, unknown>).type : undefined;
    // Before the item has a valid type, offer every item property.
    const props = model.items[type as ItemType]?.properties ?? Object.assign({}, ...Object.values(model.items).map((m) => m.properties));
    return descend(props, path.slice(2));
  },
};

/** A schema-like entry describing a layout item as a payload key. */
function itemKeyDoc(item: LayoutItem): PropSchema {
  const value = itemModel(item.type).properties.value;
  return {
    name: item.key,
    type: value?.type,
    description: `${item.type} item at [${item.rect.join(', ')}]. Set it to a ${value?.type ?? 'value'} (its value), or to an object of properties to change.`,
    rawDescription: '',
    optionNames: new Map(),
    optionDocs: new Map(),
    immutable: false,
    titleOverridden: false,
  };
}

/** Hints for setFeedback payloads, based on the current layout's items. */
export function payloadHints(items: () => LayoutItem[]): HintProvider {
  return {
    properties(path) {
      const list = items();
      if (path.length === 0) return Object.fromEntries(list.map((item) => [item.key, itemKeyDoc(item)]));
      const item = list.find((i) => i.key === path[0]);
      if (!item) return null;
      // Only what setFeedback can change.
      const props = Object.fromEntries(Object.entries(itemModel(item.type).properties).filter(([, p]) => !p.immutable));
      return descend(props, path.slice(1));
    },
  };
}

function info(name: string, prop: PropSchema): () => HTMLElement {
  return () => {
    const el = document.createElement('div');
    el.className = 'cm-hint';
    const line = (text: string, className?: string) => el.appendChild(Object.assign(document.createElement('p'), { textContent: text, className: className ?? '' }));
    const head = el.appendChild(document.createElement('div'));
    head.className = 'cm-hint-head';
    head.append(Object.assign(document.createElement('code'), { textContent: name }), ' ', Object.assign(document.createElement('span'), { className: 'cm-hint-type', textContent: typeLabel(prop) }));
    if (prop.description) line(prop.description, 'cm-hint-desc');
    const def = defaultLabel(prop);
    if (def) line(`Default: ${def}`, 'cm-hint-meta');
    // Short names inline (e.g. 4 Groove); longer explanations one per line.
    if (prop.optionNames.size && prop.optionNames.size <= 12) {
      line(`Values: ${[...prop.optionNames].map(([v, n]) => `${JSON.stringify(v)} ${n}`).join(' · ')}`, 'cm-hint-meta');
    } else if (prop.optionDocs.size) {
      line([...prop.optionDocs].map(([v, d]) => `${JSON.stringify(v)}: ${d}`).join('\n'), 'cm-hint-meta cm-hint-desc');
    }
    if (prop.immutable) line('Cannot be changed at runtime.', 'cm-hint-meta');
    return el;
  };
}

/** Existing property names of the object at `path` (to avoid suggesting duplicates). */
function existingKeys(tree: Node | undefined, path: JSONPath, except: string): Set<string> {
  const node = tree && findNodeAtLocation(tree, path);
  const keys = (node?.type === 'object' ? (node.children ?? []) : []).map((p) => p.children?.[0]?.value as string);
  return new Set(keys.filter((k) => k !== except));
}

function completionSource(provider: HintProvider) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const text = ctx.state.doc.toString();
    const token = ctx.matchBefore(/"?[^\s"{}[\],:]*/);
    if (!token || (!ctx.explicit && token.from === token.to)) return null;

    const loc = getLocation(text, ctx.pos);
    const { value, tree } = parseSource(text);
    const insert =
      (template: string, thenComplete = false) =>
      (view: EditorView, completion: Completion, from: number, to: number) => {
        const doc = view.state.doc;
        // Key completions are matched without their opening quote; replace it too.
        if (from > 0 && doc.sliceString(from - 1, from) === '"') from--;
        // ...and the closing quote, if there is one (e.g. inserted by closeBrackets).
        if (doc.sliceString(to, to + 1) === '"') to++;
        snippet(template)(view, completion, from, to);
        // Open the value list right away for properties with known values.
        if (thenComplete) queueMicrotask(() => startCompletion(view));
      };

    if (loc.isAtPropertyKey) {
      const objPath = loc.path.slice(0, -1);
      const props = provider.properties(objPath, value);
      if (!props) return null;
      const typed = String(loc.path.at(-1) ?? '');
      const taken = existingKeys(tree, objPath, typed);
      const options: Completion[] = Object.entries(props)
        .filter(([name]) => !taken.has(name))
        .map(([name, prop], i) => {
          const snip = snippetFor(prop);
          return {
            label: name,
            type: 'property',
            detail: typeLabel(prop),
            info: info(name, prop),
            boost: name === 'type' || name === 'key' ? 2 : -i / 100,
            // `$` would start a snippet field; escape it.
            apply: insert(`${JSON.stringify(name).replace(/\$/g, '\\$')}: ${snip ?? '${0}'}`, !snip && valueOptions(prop).length > 0),
          };
        });
      // Start after the opening quote so typed text is matched against bare names.
      const from = token.text.startsWith('"') ? token.from + 1 : token.from;
      return { from, options, validFor: /^[\w$-]*$/ };
    }

    const prop = loc.path.at(-1);
    if (typeof prop !== 'string') return null;
    const doc = provider.properties(loc.path.slice(0, -1), value)?.[prop];
    if (!doc) return null;
    const snip = snippetFor(doc);
    const options: Completion[] = valueOptions(doc).map((v) => ({
      label: JSON.stringify(v.value),
      detail: v.detail,
      type: typeof v.value === 'string' ? 'text' : 'constant',
      // `${0}` puts the cursor after the inserted value.
      apply: insert(JSON.stringify(v.value).replace(/[$#]\{/g, '\\$&') + '${0}'),
    }));
    if (snip && options.length === 0) {
      options.push({ label: snip.replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\s+/g, ' '), detail: typeLabel(doc), type: 'text', apply: insert(snip) });
    }
    return options.length ? { from: token.from, options, validFor: /^"?[^"]*$/ } : null;
  };
}

function hoverSource(provider: HintProvider) {
  return hoverTooltip((view, pos) => {
    const { value, tree } = parseSource(view.state.doc.toString());
    const node = tree && findNodeAtOffset(tree, pos);
    // Only property keys: the first child of a property node.
    const prop = node?.parent;
    if (!node || prop?.type !== 'property' || prop.children?.[0] !== node) return null;
    const path = getNodePath(node);
    const name = path.at(-1);
    if (typeof name !== 'string') return null;
    const doc = provider.properties(path.slice(0, -1), value)?.[name];
    if (!doc) return null;
    return {
      pos: node.offset,
      end: node.offset + node.length,
      above: true,
      create: () => ({ dom: info(name, doc)() }),
    };
  });
}

export function typeHints(provider: HintProvider): Extension {
  return [
    jsonLanguage.data.of({ autocomplete: completionSource(provider) }),
    hoverSource(provider),
    EditorView.baseTheme({
      '.cm-hint': { maxWidth: '360px', padding: '6px 8px', fontSize: '12px', lineHeight: '1.45' },
      '.cm-hint p': { margin: '4px 0 0' },
      '.cm-hint-desc': { whiteSpace: 'pre-line' },
      '.cm-hint-head code': { fontWeight: '600' },
      '.cm-hint-type, .cm-hint-meta': { opacity: '0.7' },
      '.cm-hint-type': { fontFamily: 'var(--mono)' },
    }),
  ];
}
