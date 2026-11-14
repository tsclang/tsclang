// The emit axis is a pipeline ladder: each value includes the previous desktop
// step and adds one (c → binary → exec; embedded c → hex → flash). wasm is its
// own ladder end, cmake is an alternative exit from the C stage. dts emits
// .d.tsc declarations (no codegen — the entry for library consumers). so is
// the library artifact of the binary rung (android .so for JNI/Gradle apps).
export const EMIT_VALUES = ['c', 'binary', 'exec', 'so', 'hex', 'flash', 'wasm', 'cmake', 'dts'] as const;

export type Emit = typeof EMIT_VALUES[number];
