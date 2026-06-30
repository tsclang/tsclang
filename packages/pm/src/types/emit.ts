export const EMIT_VALUES = ['c', 'binary', 'hex', 'flash', 'wasm'] as const;

export type Emit = typeof EMIT_VALUES[number];
