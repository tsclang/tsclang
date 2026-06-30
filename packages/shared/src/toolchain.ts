export const C_STANDARD = 11;

export const C_STANDARD_FLAG = '-std=c11';

export const GCC_WARN_FLAGS = ['-Wall', '-Wextra'] as const;

export const GCC_LINK_FLAGS = ['-lpthread', '-lm'] as const;

export const DEFAULT_OPTIMIZE_FLAG = '-O2';

export const SIZE_OPTIMIZE_FLAG = '-Os';

export const DEBUG_FLAG = '-g';

export const WIN32_LINK_FLAGS = ['-lws2_32'] as const;

export const LIBUV_LINK_FLAG = '-luv';

export const AVR_FLOAT_PRINTF_FLAGS = ['-Wl,-u,vfprintf', '-lprintf_flt'] as const;

export const RUNTIME_HEADER = 'runtime.h';

export const RUNTIME_WASM_HEADER = 'runtime_wasm.h';

export const DEFAULT_AVR_MCU = 'atmega328p';

export const DEFAULT_AVR_FREQ = 16000000;

export const DEFAULT_CONSOLE_BAUD = 9600;

export const TSC_DEFINES = {
  EMBEDDED: 'TSC_EMBEDDED',
  WASM: 'TSC_WASM',
  SCHEDULER_LIBUV: 'TSC_SCHEDULER_LIBUV',
  NO_POSIX: 'TSC_NO_POSIX',
  NO_STRTOLL: 'TSC_NO_STRTOLL',
  CONSOLE_UART: 'TSC_CONSOLE_UART',
  CONSOLE_BAUD: 'TSC_CONSOLE_BAUD',
} as const;
