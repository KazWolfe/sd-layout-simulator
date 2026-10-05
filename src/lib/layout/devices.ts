import { controllerModel } from './schema';
import type { Controller } from './types';

export interface Device {
  id: 'plus' | 'neo' | 'custom';
  name: string;
  controller: Controller;
  width: number;
  height: number;
}

export type PresetId = Exclude<Device['id'], 'custom'>;

// Display names per controller; canvas sizes come from the layout schema.
const PRESETS: { id: PresetId; name: string; controller: Controller }[] = [
  { id: 'plus', name: 'Stream Deck +', controller: 'Encoder' },
  { id: 'neo', name: 'Stream Deck Neo', controller: 'Neo' },
];

function preset(p: (typeof PRESETS)[number]): Device {
  return { ...p, ...controllerModel(p.controller).canvas };
}

/** The real devices, with canvas sizes from the schema. */
export function presetDevices(): Device[] {
  return PRESETS.map(preset);
}

/** Layouts without a `controller` are Encoder (Stream Deck +) layouts. */
export function deviceForController(controller: unknown): Device {
  return preset(PRESETS.find((p) => p.controller === controller) ?? PRESETS[0]);
}

export function presetDevice(id: PresetId): Device {
  return preset(PRESETS.find((p) => p.id === id)!);
}

export interface Size {
  width: number;
  height: number;
}

/** A canvas of arbitrary size, keeping the layout's controller. */
export function customDevice(controller: unknown, size: Size): Device {
  return { ...deviceForController(controller), id: 'custom', name: 'custom', ...size };
}
