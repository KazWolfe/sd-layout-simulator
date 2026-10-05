import { parseTree, printParseErrorCode, findNodeAtLocation, type Node, type ParseError } from 'jsonc-parser';
import type { Diagnostic } from './types';

export interface ParsedSource {
  /** The parsed JSON value, or undefined if the root could not be parsed. */
  value: unknown;
  tree: Node | undefined;
  /** Syntax errors, already converted to diagnostics. */
  diagnostics: Diagnostic[];
}

export function parseSource(source: string): ParsedSource {
  const errors: ParseError[] = [];
  const tree = parseTree(source, errors, { disallowComments: true, allowTrailingComma: false });
  const diagnostics: Diagnostic[] = errors.map((e) => ({
    severity: 'error',
    message: `JSON syntax: ${humanizeParseError(printParseErrorCode(e.error))}`,
    from: e.offset,
    to: e.offset + Math.max(e.length, 1),
  }));
  return { value: tree ? nodeValue(tree) : undefined, tree, diagnostics };
}

function humanizeParseError(code: string): string {
  return code.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** Like jsonc-parser's getNodeValue, but tolerant of partially-parsed trees. */
function nodeValue(node: Node): unknown {
  switch (node.type) {
    case 'array':
      return (node.children ?? []).map(nodeValue);
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const prop of node.children ?? []) {
        const [k, v] = prop.children ?? [];
        if (k && v) obj[k.value as string] = nodeValue(v);
      }
      return obj;
    }
    default:
      return node.value;
  }
}

/** Source range of the node at `path`, or of the closest existing ancestor. */
export function rangeAt(tree: Node | undefined, path: (string | number)[]): { from: number; to: number } {
  if (!tree) return { from: 0, to: 0 };
  // Problems with the document as a whole point at its opening brace, not every line.
  if (path.length === 0) return { from: tree.offset, to: tree.offset + 1 };
  for (let n = path.length; n >= 0; n--) {
    const node = findNodeAtLocation(tree, path.slice(0, n));
    if (node) {
      // For a property's value, highlight "key": value when the key exists.
      const target = n === path.length && node.parent?.type === 'property' && typeof path[n - 1] === 'string' ? node.parent : node;
      return { from: target.offset, to: target.offset + target.length };
    }
  }
  return { from: tree.offset, to: tree.offset + tree.length };
}

/** Source range of the key token of a property (falls back to rangeAt). */
export function keyRangeAt(tree: Node | undefined, path: (string | number)[]): { from: number; to: number } {
  const node = tree && findNodeAtLocation(tree, path);
  const keyNode = node?.parent?.type === 'property' ? node.parent.children?.[0] : undefined;
  return keyNode ? { from: keyNode.offset, to: keyNode.offset + keyNode.length } : rangeAt(tree, path);
}

/** Source range for each element of the root `items` array. */
export function itemRanges(tree: Node | undefined): { from: number; to: number }[] {
  const items = tree && findNodeAtLocation(tree, ['items']);
  if (items?.type !== 'array') return [];
  return (items.children ?? []).map((c) => ({ from: c.offset, to: c.offset + c.length }));
}

/** Index of the item whose source range contains `offset`, or -1. */
export function itemIndexAtOffset(tree: Node | undefined, offset: number): number {
  return itemRanges(tree).findIndex((r) => offset >= r.from && offset <= r.to);
}
