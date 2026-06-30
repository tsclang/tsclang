export const C_STANDARD = 11;

export const C_STANDARD_FLAG = '-std=c11';

export const GCC_WARN_FLAGS = ['-Wall', '-Wextra'] as const;

export const GCC_LINK_FLAGS = ['-lpthread', '-lm'] as const;

export const RUNTIME_HEADER = 'runtime.h';

export const RUNTIME_WASM_HEADER = 'runtime_wasm.h';

export const DEFAULT_AVR_MCU = 'atmega328p';

export const DEFAULT_AVR_FREQ = 16000000;

export const DEFAULT_CONSOLE_BAUD = 9600;
