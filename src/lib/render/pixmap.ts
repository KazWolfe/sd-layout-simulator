/**
 * Resolves a pixmap `value` to a URL the browser can display: data URIs pass
 * through, raw SVG markup is wrapped in a data URI, and plugin-relative file
 * paths are looked up in the user's uploaded assets.
 */
export function resolvePixmap(value: string | undefined, assets: Record<string, string>): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.startsWith('data:')) return v;
  if (v.startsWith('<svg') || v.startsWith('<?xml')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(v)}`;
  return findAsset(v, assets);
}

function findAsset(path: string, assets: Record<string, string>): string | null {
  const normalized = path.replace(/^\.?\//, '');
  if (assets[normalized]) return assets[normalized];
  // Fall back to matching by file name, with or without extension.
  // (Stream Deck lets plugins omit the extension and picks @2x/.svg variants.)
  const base = normalized.split('/').pop()!;
  const stem = base.replace(/\.[^.]+$/, '');
  for (const [name, url] of Object.entries(assets)) {
    const n = name.split('/').pop()!;
    if (n === base) return url;
  }
  for (const [name, url] of Object.entries(assets)) {
    const n = name.split('/').pop()!.replace(/(@2x)?\.[^.]+$/, '');
    if (n === stem) return url;
  }
  return null;
}
