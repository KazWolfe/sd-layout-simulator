import { customDevice, presetDevice, type Device, type PresetId, type Size } from './layout/devices';
import { loadLiveSchema, schema } from './layout/schema';
import { setAtPath } from './layout/edit';
import { isObj } from './util';
import { applyFeedback, normalizeFeedback, samplePayload } from './layout/feedback';
import { formatJson } from './layout/format';
import { keyRangeAt, parseSource } from './layout/parse';
import { TEMPLATES, templateSource } from './layout/templates';
import type { Controller, Diagnostic, LayoutItem } from './layout/types';
import { validateLayout } from './layout/validate';

const STORAGE_KEY = 'sd-layout-sim:v1';
// Kept separately: images can be large enough to exceed the storage quota.
const BACKGROUND_KEY = 'sd-layout-sim:background';

interface Persisted {
  source: string;
  payload: string;
  customSize: Size;
  previewDevice: PreviewDevice;
}

function load(): Partial<Persisted> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable or full; persistence is best-effort.
  }
}

function loadBackground(): string | null {
  try {
    return localStorage.getItem(BACKGROUND_KEY);
  } catch {
    return null;
  }
}

const saved = load();

/** Clamps a user-entered size (inputs may be empty or fractional) to 1–2000 px. */
function sanitizeSize(size: Size): Size {
  const clamp = (n: unknown) => Math.min(2000, Math.max(1, Math.round(Number(n) || 1)));
  return { width: clamp(size.width), height: clamp(size.height) };
}

export type PreviewMode = 'layout' | 'feedback';
export type PreviewDevice = PresetId | 'custom';


class AppState {
  source = $state(saved.source ?? templateSource(TEMPLATES.find((t) => t.id === '$B1')!));

  /**
   * Bumped when the active schema changes (a live copy replacing the bundled
   * one), so everything derived from it is recomputed.
   */
  schemaVersion = $state(0);
  readonly schemaInfo = $derived.by(() => {
    void this.schemaVersion;
    return { id: schema().id, source: schema().source };
  });

  /**
   * Preview device for layouts without a `controller`. A declared controller
   * always wins; this only changes the preview, never the JSON.
   */
  previewDevice: PreviewDevice = $state(saved.previewDevice ?? 'plus');
  customSize: Size = $state(saved.customSize ?? { width: 200, height: 100 });

  readonly parsed = $derived(parseSource(this.source));
  /** The layout's `controller` as written in the JSON (undefined when absent). */
  readonly layoutController: unknown = $derived(
    isObj(this.parsed.value) ? this.parsed.value.controller : undefined,
  );
  /** The layout's `controller`, only once it is a value the schema accepts. */
  readonly declaredController: Controller | undefined = $derived.by(() => {
    void this.schemaVersion;
    const c = this.layoutController;
    return schema().controllers.some((m) => m.controller === c) ? (c as Controller) : undefined;
  });
  /** The preview's device when the layout doesn't declare a valid one (null: the schema's default). */
  readonly deviceOverride: Device | null = $derived.by(() => {
    void this.schemaVersion;
    if (this.declaredController !== undefined) return null;
    if (this.previewDevice === 'custom') return customDevice(undefined, sanitizeSize(this.customSize));
    return this.previewDevice === 'plus' ? null : presetDevice(this.previewDevice);
  });
  readonly validation = $derived.by(() => {
    void this.schemaVersion;
    return validateLayout(this.parsed.value, this.parsed.tree, this.deviceOverride);
  });
  readonly device: Device = $derived(this.validation.device);

  readonly diagnostics: Diagnostic[] = $derived(
    [...this.parsed.diagnostics, ...this.validation.diagnostics].sort((a, b) => a.from - b.from),
  );
  /** Problems that would make Stream Deck refuse to render the layout. */
  readonly renderBlockers: Diagnostic[] = $derived(this.diagnostics.filter((d) => d.blocksRender));
  /** Source indices of items involved in render-blocking problems. */
  readonly blockingItems: Set<number> = $derived(
    new Set(this.renderBlockers.flatMap((d) => [d.itemIndex, d.relatedIndex].filter((i) => i !== undefined))),
  );

  /** Items as defined in the layout JSON (renderable ones only). */
  readonly layoutItems: LayoutItem[] = $derived(this.validation.layout?.items ?? []);

  // setFeedback simulation
  /** Preview the layout as defined, or with the payload applied via setFeedback. */
  mode: PreviewMode = $state('layout');

  /** Text of the live feedback payload editor. */
  payloadText = $state(saved.payload ?? '');

  readonly payloadParsed = $derived(parseSource(this.payloadText));
  readonly payloadDiagnostics: Diagnostic[] = $derived.by(() => {
    void this.schemaVersion;
    const { value, tree, diagnostics } = this.payloadParsed;
    if (diagnostics.length || value === undefined) return diagnostics;
    return normalizeFeedback(value, this.layoutItems).warnings.map((w) => ({
      severity: 'warning' as const,
      message: w.message,
      ...keyRangeAt(tree, w.path),
    }));
  });
  /** The payload, if it is valid JSON. */
  readonly payload: Record<string, unknown> | null = $derived.by(() => {
    const { value, diagnostics } = this.payloadParsed;
    return diagnostics.length === 0 && isObj(value) ? value : null;
  });
  // The last valid payload, so the preview holds steady while the JSON is mid-edit.
  #lastValidPayload: Record<string, unknown> | null = null;
  /** What setFeedback would apply: the payload editor's content. */
  readonly feedbackState = $derived.by(() => {
    if (this.payload) this.#lastValidPayload = this.payload;
    return this.#lastValidPayload ? normalizeFeedback(this.#lastValidPayload, this.layoutItems).patches : {};
  });

  /** Items with all feedback so far applied (regardless of preview mode). */
  readonly feedbackItems: LayoutItem[] = $derived(applyFeedback(this.layoutItems, this.feedbackState));
  /** Items as they would currently appear on the device. */
  readonly renderedItems: LayoutItem[] = $derived(this.mode === 'feedback' ? this.feedbackItems : this.layoutItems);

  /** Selected / hovered item, as an index into the source `items` array. */
  selected: number | null = $state(null);
  hovered: number | null = $state(null);

  zoom = $state(3);
  showBounds = $state(true);
  showRulers = $state(true);
  /** Pointer position over the screen, in device pixels. */
  pointer: { x: number; y: number } | null = $state(null);
  /** Show dummy content for items that have no value. */
  placeholders = $state(true);

  /** Simulated device background image (data URL), drawn behind the layout. */
  background: string | null = $state(loadBackground());

  /** Uploaded images keyed by file name, used to resolve pixmap file paths. */
  assets: Record<string, string> = $state({});

  constructor() {
    // Prefer the latest published schema; keep the bundled copy if it can't be fetched.
    loadLiveSchema().then((replaced) => {
      if (replaced) this.schemaVersion++;
    });
    $effect.root(() => {
      $effect(() => {
        const data: Persisted = {
          source: this.source,
          payload: this.payloadText,
          customSize: this.customSize,
          previewDevice: this.previewDevice,
        };
        store(STORAGE_KEY, JSON.stringify(data));
      });
      $effect(() => store(BACKGROUND_KEY, this.background));
      // Seed the payload editor with a sample once there is a layout to sample from.
      // Only once: a payload the user clears on purpose must stay empty.
      let seeded = false;
      $effect(() => {
        if (seeded) return;
        if (this.payloadText.trim()) seeded = true;
        else if (this.layoutItems.length) {
          seeded = true;
          this.resetPayloadToSample();
        }
      });
    });
  }

  /** Source index for a rendered item index. */
  sourceIndexOf(renderIndex: number): number {
    return this.validation.sourceIndex[renderIndex];
  }

  /** Renderable item index for a source index, or -1. */
  renderIndexOf(sourceIndex: number | null): number {
    return sourceIndex === null ? -1 : this.validation.sourceIndex.indexOf(sourceIndex);
  }

  loadTemplate(id: string) {
    const t = TEMPLATES.find((t) => t.id === id);
    if (t) {
      this.source = templateSource(t);
      this.selected = null;
    }
  }

  /** Updates the payload editor text; a valid payload switches the preview to show it. */
  setPayloadText(text: string) {
    this.payloadText = text;
    if (this.payload) this.mode = 'feedback';
  }

  /**
   * Sets one item's value from a quick control by writing it into the payload
   * (preserving formatting). Needs the payload to be valid JSON.
   */
  setItemValue(key: string, value: unknown) {
    const current = this.payload;
    if (!current) return;
    this.setPayloadText(setAtPath(this.payloadText, isObj(current[key]) ? [key, 'value'] : [key], value));
  }

  resetPayloadToSample() {
    this.payloadText = formatJson(samplePayload(this.layoutItems));
  }
}

export const app = new AppState();
