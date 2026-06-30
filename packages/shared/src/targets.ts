export const TARGET_NAMES = [
  'desktop',
  'avr',
  'arm',
  'nes',
  'spectrum',
  'genesis',
  'dos',
  'ps2',
  'wasm',
  'wasm32',
] as const;

export type Target = typeof TARGET_NAMES[number];
