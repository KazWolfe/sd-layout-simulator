import { isObj } from '../util';
import { defaultRange, itemModel } from './schema';
import { checkValue } from './validate';
import type { LayoutItem } from './types';

/**
 * Simulation of `action.setFeedback(payload)`.
 *
 * Each key in the payload targets the layout item with that `key`. A value may
 * be given implicitly (a string for text/pixmap, a number for bar/gbar) or as an
 * object of properties to change. Feedback accumulates: later calls merge over
 * earlier ones, just like on the device. `key`, `type`, and `rect` cannot be
 * changed at runtime.
 */

export type ItemPatch = Partial<Omit<LayoutItem, 'key' | 'type' | 'rect'>> & Record<string, unknown>;
export type FeedbackState = Record<string, ItemPatch>;

export interface FeedbackEvent {
  id: number;
  time: number;
  payload: Record<string, unknown>;
  /** Identifies the UI control that produced this event, for coalescing. */
  source?: string;
}

export interface FeedbackWarning {
  message: string;
  /** Location of the problem within the payload, e.g. ["title", "rect"]. */
  path: string[];
}

export interface NormalizedFeedback {
  patches: FeedbackState;
  warnings: FeedbackWarning[];
}

export function normalizeFeedback(payload: unknown, items: LayoutItem[]): NormalizedFeedback {
  const patches: FeedbackState = {};
  const warnings: FeedbackWarning[] = [];
  const warn = (message: string, ...path: string[]) => warnings.push({ message, path });

  if (!isObj(payload)) {
    warn('setFeedback payload must be an object keyed by layout item key.');
    return { patches, warnings };
  }

  for (const [key, v] of Object.entries(payload)) {
    const item = items.find((i) => i.key === key);
    if (!item) {
      warn(`No layout item has key "${key}"; ignored.`, key);
      continue;
    }

    const props = itemModel(item.type).properties;

    // Implicit form: the item's `value`, e.g. { "title": "Hi" } or { "indicator": 50 }.
    if (!isObj(v)) {
      const problem = props.value ? checkValue(props.value, v) : 'has no value';
      if (!problem) patches[key] = { value: v as string | number }; // checked against the schema above
      else warn(`"${key}" (${item.type}) expects a ${props.value?.type ?? 'value'} or an object of properties; got ${JSON.stringify(v)}.`, key);
      continue;
    }

    const patch: ItemPatch = {};
    for (const [prop, pv] of Object.entries(v)) {
      const schema = props[prop];
      if (!schema) {
        warn(`"${prop}" is not a property of ${item.type} items; ignored.`, key, prop);
        continue;
      }
      if (schema.immutable) {
        warn(`"${key}.${prop}" cannot be changed at runtime; ignored.`, key, prop);
        continue;
      }
      const problem = checkValue(schema, pv);
      if (problem) {
        warn(`"${key}.${prop}" ${problem}; ignored.`, key, prop);
        continue;
      }
      patch[prop] = pv;
    }
    if (Object.keys(patch).length) patches[key] = patch;
  }

  return { patches, warnings };
}

function mergePatch(base: ItemPatch, patch: ItemPatch): ItemPatch {
  const out: ItemPatch = { ...base, ...patch };
  if (base.font && patch.font) out.font = { ...base.font, ...patch.font };
  return out;
}

/** Folds a sequence of setFeedback payloads into accumulated per-key state. */
export function foldFeedback(events: FeedbackEvent[], items: LayoutItem[]): FeedbackState {
  const state: FeedbackState = {};
  for (const e of events) {
    for (const [key, patch] of Object.entries(normalizeFeedback(e.payload, items).patches)) {
      state[key] = mergePatch(state[key] ?? {}, patch);
    }
  }
  return state;
}

export function applyFeedback(items: LayoutItem[], state: FeedbackState): LayoutItem[] {
  return items.map((item) => {
    const patch = state[item.key];
    return patch ? ({ ...mergePatch(item as unknown as ItemPatch, patch), key: item.key, type: item.type, rect: item.rect } as LayoutItem) : item;
  });
}

/** A starter payload that exercises every item in the layout. */
export function samplePayload(items: LayoutItem[]): Record<string, unknown> {
  return Object.fromEntries(
    items.map((item) => {
      switch (item.type) {
        case 'text':
          return [item.key, item.key === 'title' ? 'My Action' : 'Hello'];
        case 'pixmap':
          return [item.key, 'imgs/icon.png'];
        default: {
          const range = item.range ?? defaultRange();
          return [item.key, { value: (range.min + range.max) / 2, range }];
        }
      }
    }),
  );
}

/** Renders a payload as the plugin code that would produce it. */
export function feedbackSnippet(payload: Record<string, unknown>): string {
  return `await ev.action.setFeedback(${JSON.stringify(payload, null, 2)});`;
}
