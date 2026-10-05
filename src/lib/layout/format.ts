/**
 * JSON.stringify variant that keeps short arrays/objects of primitives on one
 * line (e.g. `"rect": [16, 10, 136, 24]`), matching how layouts are usually
 * hand-written.
 */
export function formatJson(value: unknown, indent = '  ', maxInline = 72): string {
  return fmt(value, '', indent, maxInline) + '\n';
}

function isPrimitive(v: unknown): boolean {
  return v === null || typeof v !== 'object';
}

function fmt(value: unknown, pad: string, indent: string, maxInline: number): string {
  if (isPrimitive(value)) return JSON.stringify(value);

  const inner = pad + indent;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(isPrimitive)) {
      const inline = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      if (inline.length + pad.length <= maxInline) return inline;
    }
    return `[\n${value.map((v) => inner + fmt(v, inner, indent, maxInline)).join(',\n')}\n${pad}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  if (entries.every(([, v]) => isPrimitive(v))) {
    const inline = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
    if (inline.length + pad.length <= maxInline && entries.length <= 3) return inline;
  }
  return `{\n${entries
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${fmt(v, inner, indent, maxInline)}`)
    .join(',\n')}\n${pad}}`;
}
