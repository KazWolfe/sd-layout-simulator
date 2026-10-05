import { customDevice, presetDevice, type Device, type PresetId, type Size } from './layout/devices';
import { loadLiveSchema, schema } from './layout/schema';
import { setAtPath } from './layout/edit';
import { isObj } from './util';
import { applyFeedback, foldFeedback, normalizeFeedback, samplePayload, type FeedbackEvent } from './layout/feedback';
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
  events: FeedbackEvent[];
  payload: string;
  live: boolean;
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

const LIVE_SOURCE = 'payload:live';

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
  events: FeedbackEvent[] = $state.raw(saved.events ?? []);
  readonly feedbackState = $derived(foldFeedback(this.events, this.layoutItems));
  mode: PreviewMode = $state('feedback');

  /** Text of the live feedback payload editor. */
  payloadText = $state(saved.payload ?? '');
  /** When on, every valid edit of the payload is applied immediately. */
  live = $state(saved.live ?? true);

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

  #nextEventId = Math.max(0, ...this.events.map((e) => e.id)) + 1;

  constructor() {
    // Prefer the latest published schema; keep the bundled copy if it can't be fetched.
    loadLiveSchema().then((replaced) => {
      if (replaced) this.schemaVersion++;
    });
    $effect.root(() => {
      $effect(() => {
        const data: Persisted = {
          source: this.source,
          events: this.events,
          payload: this.payloadText,
          live: this.live,
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

  sendFeedback(payload: Record<string, unknown>, source?: string) {
    const last = this.events.at(-1);
    const event: FeedbackEvent = { id: this.#nextEventId++, time: Date.now(), payload, source };
    // Coalesce rapid changes from the same control (e.g. dragging a slider), and
    // consecutive live payload edits, so the latest edit replaces the previous one.
    if (source && last?.source === source && (source === LIVE_SOURCE || event.time - last.time < 1500)) {
      this.events = [...this.events.slice(0, -1), { ...event, id: last.id }];
    } else {
      this.events = [...this.events, event];
    }
    this.mode = 'feedback';
  }

  /** Updates the payload editor text, applying it immediately in live mode. */
  setPayloadText(text: string) {
    this.payloadText = text;
    if (this.live && this.payload) this.sendFeedback(this.payload, LIVE_SOURCE);
  }

  setLive(on: boolean) {
    this.live = on;
    if (on && this.payload) this.sendFeedback(this.payload, LIVE_SOURCE);
  }

  /**
   * Sets one item's value from a quick control. The change is written into the
   * payload editor (preserving its formatting) so it always reflects what has
   * been sent, then applied: the whole payload in live mode, else just this key.
   */
  setItemValue(key: string, value: unknown) {
    const current = this.payload;
    if (current) {
      const existing = current[key];
      this.payloadText = setAtPath(this.payloadText, isObj(existing) ? [key, 'value'] : [key], value);
    }
    if (this.live && this.payload) this.sendFeedback(this.payload, LIVE_SOURCE);
    else this.sendFeedback({ [key]: value }, `control:${key}`);
  }

  sendPayload() {
    if (this.payload) this.sendFeedback(this.payload);
  }

  resetPayloadToSample() {
    this.payloadText = formatJson(samplePayload(this.layoutItems));
  }

  resetFeedback() {
    this.events = [];
  }
}

export const app = new AppState();
