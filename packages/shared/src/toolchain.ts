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

/** Emscripten JS library providing env.log (console.log) for the wasm
 * runtime header; passed to emcc via --js-library. */
export const RUNTIME_WASM_LIB = 'runtime_wasm_lib.js';

export const DEFAULT_AVR_MCU = 'atmega328p';

export const DEFAULT_AVR_FREQ = 16000000;

export const DEFAULT_CONSOLE_BAUD = 9600;

// ── Android (NDK clang cross-compilation, #283) ────────────────────────────

/** Default Android target: arm64 devices. API 24+ gives the full C11 bionic
 * library (strtoll, timespec_get) with pthreads already in libc. */
export const ANDROID_TRIPLE = 'aarch64-linux-android';

/** Minimum bionic API level the runtime targets. */
export const ANDROID_API_LEVEL = 24;

/** The single --target flag every NDK-clang invocation carries. */
export const ANDROID_TARGET_FLAG = `--target=${ANDROID_TRIPLE}${ANDROID_API_LEVEL}`;

/** bionic link flags: pthreads live in libc (no -lpthread since NDK r18 —
 * the flag is a hard link error there), libm is still separate. */
export const ANDROID_LINK_FLAGS = ['-lm'] as const;

/** adb `ro.product.cpu.abi` → LLVM target triple. Emulators are x86_64, so
 * run-tier tooling picks the triple from the device instead of assuming arm64. */
export const ANDROID_ABI_TRIPLES: Readonly<Record<string, string>> = {
  'arm64-v8a': ANDROID_TRIPLE,
  x86_64: 'x86_64-linux-android',
};

export interface NdkCompileOptions {
  /** Input .c path. */
  cPath: string;
  /** Output artifact: PIE executable or .so. */
  outPath: string;
  /** Directory containing runtime.h (-I). */
  runtimeInclude: string;
  /** Sysroot of the isolated NDK bundle (<bundle>/sysroot). Omitted for a
   * PATH-pinned clang — the NDK driver then locates its own sysroot. */
  sysroot?: string;
  /** Shared library (-shared -fPIC) instead of a PIE executable. */
  shared?: boolean;
  /** Optimize level WITHOUT the dash ('O2', 'Os'), like the other branches. */
  optimize?: string | null;
  /** Extra -I dirs from the profile capabilities. */
  includeDirs?: string[];
  /** capabilityDefines(...) output. */
  defines?: string[];
  /** Override the --target flag (x86_64 emulator builds use the ABI map). */
  targetFlag?: string;
}

/** Arg vector for one NDK-clang compile. Shared by the CLI build command and
 * the test-engine backend so both stay flag-for-flag identical (#283 parity,
 * same role as buildEmccArgs for wasm). */
export function buildNdkCompileArgs(o: NdkCompileOptions): string[] {
  return [
    o.cPath, '-o', o.outPath,
    '-I', o.runtimeInclude,
    o.targetFlag ?? ANDROID_TARGET_FLAG,
    ...(o.sysroot ? ['--sysroot', o.sysroot] : []),
    ...(o.shared ? ['-shared', '-fPIC'] : ['-fPIE', '-pie']),
    ...ANDROID_LINK_FLAGS,
    C_STANDARD_FLAG,
    ...(o.optimize ? [`-${o.optimize}`] : []),
    ...(o.includeDirs ?? []).flatMap((d) => ['-I', d]),
    ...(o.defines ?? []),
  ];
}

// ── iOS (Xcode clang cross-compilation, #283) ───────────────────────────────

/** The Apple SDK is not redistributable — there is no iOS toolchain bundle.
 * Compilation goes through `xcrun --sdk <sdk> clang` on macOS with Xcode
 * Command Line Tools; that requirement IS the platform's install story. */

/** Device triple (arm64 iPhones; iOS 16 = oldest commonly installed base). */
export const IOS_DEVICE_TRIPLE = 'arm64-apple-ios16.0';

/** Simulator triple — simulator binaries are host-runnable macho, which is
 * what makes the ios run-tier possible without any emulator (#283 phase 3). */
export const IOS_SIM_TRIPLE = 'arm64-apple-ios16.0-simulator';

/** Same for intel hosts (arm64 sim slices need an arm64 host). */
export const IOS_SIM_TRIPLE_X64 = 'x86_64-apple-ios16.0-simulator';

/** builds.<n>.sdk values — which Apple SDK xcrun compiles against. */
export const IOS_SDKS = ['iphonesimulator', 'iphoneos'] as const;
export type IosSdk = typeof IOS_SDKS[number];

export interface IosCompileOptions {
  /** Input .c path. */
  cPath: string;
  /** Output artifact path. */
  outPath: string;
  /** Directory containing runtime.h (-I). */
  runtimeInclude: string;
  /** Which Apple SDK to compile against. */
  sdk: IosSdk;
  /** Override the -target triple (defaults per sdk: device/sim arm64). */
  triple?: string;
  /** Optimize level WITHOUT the dash ('O2', 'Os'), like the other branches. */
  optimize?: string | null;
  /** Extra -I dirs from the profile capabilities. */
  includeDirs?: string[];
  /** capabilityDefines(...) output. */
  defines?: string[];
}

/** Arg vector for one xcrung iOS compile: spawn('xcrun', buildIosCompileArgs()).
 * Shared by the CLI build command and the ios-sim test backend (#283 parity,
 * same role as buildNdkCompileArgs for android). */
export function buildIosCompileArgs(o: IosCompileOptions): string[] {
  const triple = o.triple ?? (o.sdk === 'iphoneos' ? IOS_DEVICE_TRIPLE : IOS_SIM_TRIPLE);
  return [
    '--sdk', o.sdk, 'clang',
    o.cPath, '-o', o.outPath,
    '-I', o.runtimeInclude,
    `-target=${triple}`,
    '-fPIE', '-pie',
    C_STANDARD_FLAG,
    ...(o.optimize ? [`-${o.optimize}`] : []),
    ...(o.includeDirs ?? []).flatMap((d) => ['-I', d]),
    ...(o.defines ?? []),
  ];
}

export const TSC_DEFINES = {
  EMBEDDED: 'TSC_EMBEDDED',
  WASM: 'TSC_WASM',
  SCHEDULER_LIBUV: 'TSC_SCHEDULER_LIBUV',
  NO_POSIX: 'TSC_NO_POSIX',
  NO_STRTOLL: 'TSC_NO_STRTOLL',
  CONSOLE_UART: 'TSC_CONSOLE_UART',
  CONSOLE_BAUD: 'TSC_CONSOLE_BAUD',
} as const;
