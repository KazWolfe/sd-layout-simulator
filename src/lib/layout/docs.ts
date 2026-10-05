import { NAMED_COLORS } from './color';
import type { PropSchema } from './schema';

/**
 * Presentation helpers for schema properties, used by editor hints and the
 * Item panel. All content comes from the layout schema (see schema.ts).
 */

export interface ValueOption {
  value: unknown;
  /** Short annotation, e.g. a subtype's name. */
  detail?: string;
}

/** Short type label, e.g. `"left" | "center" | "right"`, `number (0–700)`, `[x, y, width, height]`. */
export function typeLabel(prop: PropSchema): string {
  if (prop.const !== undefined) return JSON.stringify(prop.const);
  if (prop.enum) return prop.enum.length <= 6 ? prop.enum.map((v) => JSON.stringify(v)).join(' | ') : `${prop.type} (${prop.enum.length} values)`;
  if (prop.tuple) return `[${prop.tuple.map((t) => t.name).join(', ')}]`;
  if (prop.properties) {
    const req = new Set(prop.required ?? []);
    return `{ ${Object.values(prop.properties)
      .map((p) => `${p.name}${req.has(p.name) ? '' : '?'}: ${typeLabel(p)}`)
      .join(', ')} }`;
  }
  if (prop.type === 'number' && (prop.minimum !== undefined || prop.maximum !== undefined)) {
    return `number (${prop.minimum ?? '…'}–${prop.maximum ?? '…'})`;
  }
  if (prop.color) return prop.color === 'gradient' ? 'color | gradient' : 'color';
  return prop.type ?? 'any';
}

/** Value suggestions: enum values (with names), booleans, or named colors. */
export function valueOptions(prop: PropSchema): ValueOption[] {
  if (prop.const !== undefined) return [{ value: prop.const }];
  if (prop.enum) return prop.enum.map((value) => ({ value, detail: prop.optionNames.get(value) ?? prop.optionDocs.get(value) }));
  if (prop.type === 'boolean') return [{ value: true }, { value: false }];
  if (prop.color) return NAMED_COLORS.map((value) => ({ value }));
  if (prop.type === 'string' && prop.examples) return prop.examples.map((value) => ({ value, detail: 'example' }));
  return [];
}

/**
 * CodeMirror snippet for a property's value, with tab stops for each part:
 * tuples and objects are expanded from their schema; scalars use their
 * default, example, or minimum as placeholder text.
 */
export function snippetFor(prop: PropSchema): string | undefined {
  let field = 0;
  const placeholder = (p: PropSchema): string => {
    const sample = p.default ?? p.examples?.[0] ?? p.minimum ?? (p.type === 'number' ? 0 : p.name);
    return `\${${++field}:${String(sample).replace(/[{}]/g, '')}}`;
  };
  if (prop.tuple) return `[${prop.tuple.map(placeholder).join(', ')}]`;
  if (prop.properties) {
    // Prefer values from the object's own default, e.g. range → { min: 0, max: 100 }.
    const own = (prop.default ?? {}) as Record<string, unknown>;
    return `{ ${Object.values(prop.properties)
      .map((p) => {
        const field = own[p.name] !== undefined ? placeholder({ ...p, default: own[p.name] }) : placeholder(p);
        return `"${p.name}": ${p.type === 'string' ? `"${field}"` : field}`;
      })
      .join(', ')} }`;
  }
  if (prop.type === 'array') return '[\n\t${0}\n]';
  if (prop.type === 'string' && !prop.enum && !prop.const && !prop.color) return `"${placeholder(prop)}"`;
  return undefined;
}

/** Display string for a documented default. */
export function defaultLabel(prop: PropSchema): string | undefined {
  if (prop.default === undefined) return undefined;
  const name = prop.optionNames.get(prop.default);
  return JSON.stringify(prop.default) + (name ? ` (${name})` : '');
}
