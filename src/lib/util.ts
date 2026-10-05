/** Small shared helpers. */

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads a file as a data URL. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Session-scoped numeric preference; storage failures fall back silently. */
export const sessionNumber = {
  get(key: string, fallback: number): number {
    try {
      return Number(sessionStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: number) {
    try {
      sessionStorage.setItem(key, String(value));
    } catch {
      // Best-effort.
    }
  },
};
