import { applyEdits, modify, type JSONPath } from 'jsonc-parser';

/**
 * Text-preserving edits to layout JSON. These are the building blocks for
 * WYSIWYG editing: changes made in the preview are written back into the
 * source without reformatting the rest of the document.
 */
const FORMATTING = { insertSpaces: true, tabSize: 2, eol: '\n' };

/** Sets (or, with `undefined`, removes) the value at `path`. */
export function setAtPath(source: string, path: JSONPath, value: unknown): string {
  return applyEdits(source, modify(source, path, value, { formattingOptions: FORMATTING }));
}
