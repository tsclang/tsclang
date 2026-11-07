// The emit axis is a pipeline ladder: each value includes the previous desktop
// step and adds one (c → binary → exec; embedded c → hex → flash). wasm is its
// own ladder end, cmake is an alternative exit from the C stage. dts emits
// .d.tsc declarations (no codegen — the entry for library consumers).
export const EMIT_VALUES = ['c', 'binary', 'exec', 'hex', 'flash', 'wasm', 'cmake', 'dts'] as const;

export type Emit = typeof EMIT_VALUES[number];
