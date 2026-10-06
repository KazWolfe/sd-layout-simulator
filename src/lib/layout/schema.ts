import bundledSchema from './schema/layout.schema.json';
import type { Controller, ItemType, Range } from './types';

/**
 * A model of the Elgato layout JSON schema. Property lists, types, enums,
 * defaults, descriptions, and canvas sizes are all read from the schema itself,
 * so updating the schema (npm run schema:update) updates the app.
 */

export const SCHEMA_URL = 'https://schemas.elgato.com/streamdeck/plugins/layout.json';

export type Json = Record<string, any>;

export interface PropSchema {
  name: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Human-readable description (examples, options, and default stripped). */
  description: string;
  /** The description exactly as written in the schema. */
  rawDescription: string;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  pattern?: RegExp;
  patternMessage?: string;
  default?: unknown;
  examples?: unknown[];
  /** Names for enum values parsed from the description, e.g. 4 → "Groove". */
  optionNames: Map<unknown, string>;
  /** Explanations of enum values parsed from the description, e.g. "fade" → "applies a fade-gradient…". */
  optionDocs: Map<unknown, string>;
  /** Object properties. */
  properties?: Record<string, PropSchema>;
  required?: string[];
  additionalProperties?: boolean;
  /** Tuple items (e.g. rect's x, y, width, height). */
  tuple?: PropSchema[];
  /** Accepts a color string; `gradient` also accepts gradients. */
  color?: 'solid' | 'gradient';
  /** Cannot be changed at runtime (via setFeedback). */
  immutable: boolean;
  /** Overridden by the user's title settings when the item's key is "title". */
  titleOverridden: boolean;
}

export interface ItemModel {
  type: ItemType;
  /** `$ref` of the item's definition in the raw schema. */
  ref: string;
  properties: Record<string, PropSchema>;
  required: string[];
}

export interface ControllerModel {
  controller: Controller;
  canvas: { width: number; height: number };
  root: { properties: Record<string, PropSchema>; required: string[] };
  items: Record<ItemType, ItemModel>;
}

export interface SchemaModel {
  id: string;
  /** Where the schema came from. */
  source: 'bundled' | 'live';
  /** The schema JSON itself, for the editors' JSON language service. */
  raw: Json;
  controllers: ControllerModel[];
}

export function resolveRef(root: Json, ref: string): Json {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref: ${ref}`);
  return ref
    .slice(2)
    .split('/')
    .map((seg) => decodeURIComponent(seg).replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<Json>((node, seg) => node?.[seg], root);
}

const DEFAULT_RE = /[;,.]?\s*[Dd]efault is `([^`]+)`(?:\s*\((-?[\d.]+)\))?\.?/;

/** Reads "Default is `x`" from a description. */
function defaultFromDescription(desc: string): unknown {
  const m = DEFAULT_RE.exec(desc);
  if (!m) return undefined;
  if (m[2] !== undefined) return Number(m[2]); // e.g. `BarSubType.Groove` (4)
  try {
    return JSON.parse(m[1]);
  } catch {
    return m[1];
  }
}

/** Reads option names from "- Name (value)" lists. */
function optionNamesFromDescription(desc: string): Map<unknown, string> {
  return new Map([...desc.matchAll(/^- (.+?) \((-?[\d.]+)\)\s*$/gm)].map((m) => [Number(m[2]), m[1]]));
}

/** Reads option explanations from "- value, explanation" lists. */
function optionDocsFromDescription(desc: string, values: unknown[] | undefined): Map<unknown, string> {
  const docs = new Map<unknown, string>();
  for (const m of desc.matchAll(/^- ([\w-]+), (.+)$/gm)) {
    if (values?.includes(m[1])) docs.set(m[1], m[2].replace(/\.$/, ''));
  }
  return docs;
}

/**
 * Description for display: drops the Examples/Options sections (shown
 * separately) and the "Default is …" sentence, and strips markdown emphasis.
 * Line breaks are kept so lists still read as lists.
 */
function cleanDescription(desc: string): string {
  const text = desc
    .split(/\n\n\*\*(?:Examples|Options)/)[0]
    .replace(DEFAULT_RE, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return /[.:)]$/.test(text) || /\n- /.test(text) ? text : `${text}.`;
}

function toProp(root: Json, name: string, s: Json): PropSchema {
  const resolved = s.$ref ? { ...resolveRef(root, s.$ref), ...s } : s;
  const raw: string = resolved.description ?? '';
  const prop: PropSchema = {
    name,
    type: resolved.type,
    description: cleanDescription(raw),
    rawDescription: raw,
    enum: resolved.enum,
    const: resolved.const,
    minimum: resolved.minimum,
    maximum: resolved.maximum,
    pattern: resolved.pattern ? new RegExp(resolved.pattern) : undefined,
    patternMessage: resolved.errorMessage,
    default: resolved.default ?? defaultFromDescription(raw),
    examples: resolved.examples,
    optionNames: optionNamesFromDescription(raw),
    optionDocs: optionDocsFromDescription(raw, resolved.enum),
    required: resolved.required,
    additionalProperties: resolved.additionalProperties,
    color: /named color/i.test(raw) ? (/gradient/i.test(raw) ? 'gradient' : 'solid') : undefined,
    immutable: /cannot be changed at runtime/i.test(raw),
    titleOverridden: /"title"/.test(raw) && /ignored/i.test(raw),
  };
  // Value explanations are shown separately; drop them from the description.
  if (prop.optionDocs.size) prop.description = prop.description.replace(/\n- [\w-]+, .*$/gm, '').trim();
  if (resolved.properties) {
    prop.properties = Object.fromEntries(Object.entries<Json>(resolved.properties).map(([k, v]) => [k, toProp(root, k, v)]));
  }
  if (Array.isArray(resolved.items)) {
    prop.tuple = resolved.items.map((item: Json, i: number) => toProp(root, item.title ?? String(i), item));
  }
  return prop;
}

function toItemModel(root: Json, type: ItemType, ref: string): ItemModel {
  const def = resolveRef(root, ref);
  const properties = Object.fromEntries(Object.entries<Json>(def.properties).map(([k, v]) => [k, toProp(root, k, v)]));
  // The default range is only stated in prose, on `value` ("default range is `0..100`").
  const m = /default range is `?(-?\d+)\.\.(-?\d+)`?/i.exec(properties.value?.rawDescription ?? '');
  if (properties.range && m && properties.range.default === undefined) {
    properties.range.default = { min: Number(m[1]), max: Number(m[2]) };
  }
  return { type, ref, properties, required: def.required ?? [] };
}

export function buildSchemaModel(root: Json, source: SchemaModel['source']): SchemaModel {
  const layout = resolveRef(root, root.$ref);
  const controllers = (layout.anyOf as Json[]).map((branch): ControllerModel => {
    const props = branch.properties;
    const itemSchema = props.items.items;
    const items = {} as Record<ItemType, ItemModel>;
    for (const rule of itemSchema.allOf as Json[]) {
      const type = rule.if.properties.type.const as ItemType;
      items[type] = toItemModel(root, type, rule.then.$ref);
    }
    // Canvas size: the maximum x and y of any item's rect.
    const rect = Object.values(items)[0].properties.rect.tuple!;
    return {
      controller: props.controller.const,
      canvas: { width: rect[0].maximum!, height: rect[1].maximum! },
      root: {
        properties: Object.fromEntries(Object.entries<Json>(props).map(([k, v]) => [k, toProp(root, k, v)])),
        required: branch.required ?? [],
      },
      items,
    };
  });
  return { id: root.$id, source, raw: root, controllers };
}

// The active schema: the bundled copy, possibly replaced by a live one (see loadLiveSchema).
let current = buildSchemaModel(bundledSchema as Json, 'bundled');

export function schema(): SchemaModel {
  return current;
}

/** Model for a layout's controller; layouts without a valid controller are Encoder layouts. */
export function controllerModel(controller: unknown): ControllerModel {
  return current.controllers.find((c) => c.controller === controller) ?? current.controllers.find((c) => c.controller === 'Encoder')!;
}

export function itemModel(type: ItemType, controller?: unknown): ItemModel {
  return controllerModel(controller).items[type];
}

/** Documented defaults for an item type's properties. */
export function itemDefaults(type: ItemType): Record<string, unknown> {
  return Object.fromEntries(
    Object.values(itemModel(type).properties)
      .filter((p) => p.default !== undefined)
      .map((p) => [p.name, p.default]),
  );
}

/** Default bar range (from the schema; see toItemModel). */
export function defaultRange(): Range {
  return (itemModel('bar').properties.range?.default as Range | undefined) ?? { min: 0, max: 100 };
}

/**
 * Tries to fetch the latest schema. Resolves to true if it replaced the bundled
 * copy. Expected to fail when the schema host does not allow cross-origin requests.
 */
export async function loadLiveSchema(timeoutMs = 4000): Promise<boolean> {
  try {
    const res = await fetch(SCHEMA_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    current = buildSchemaModel(await res.json(), 'live');
    return true;
  } catch {
    return false;
  }
}
