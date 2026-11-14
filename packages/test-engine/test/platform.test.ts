// Self-test: platform matrix closure — AVR mcu/freq knobs, wasm defines,
// honest target→backend model
// Ref: #207 P1.6 — matrix MCU reachable from tests; wasm tested like prod;
// unavailable targets declared, not silently absent
import { describe, test, expect, platformMatrix } from "../src/engine.ts"
import { buildAvrCompileArgs, buildSimavrArgs, normalizeSimavrOut } from "../src/compilers/avr-gcc.ts"
import { buildEmccArgs } from "../src/compilers/wasm.ts"
import { androidTargetFlagFor, buildAdbShellArgs, parseAdbRunOut, adbHasDevice } from "../src/compilers/ndk-clang.ts"
import { iosSimTripleFor } from "../src/compilers/ios-sim.ts"
import { DEFAULT_AVR_MCU, DEFAULT_AVR_FREQ, TSC_DEFINES } from "@tsclang/shared"
import { readdirSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const args = (xs: string[]) => xs.join(" ")

describe("avr-gcc — buildAvrCompileArgs", () => {
  test("default mcu when none given", () => {
    expect(args(buildAvrCompileArgs({ cPath: "in.c", elfPath: "out.elf" }))).toContain(`-mmcu=${DEFAULT_AVR_MCU}`)
  })
  test("mcu from opts lands in -mmcu=", () => {
    expect(args(buildAvrCompileArgs({ cPath: "in.c", elfPath: "out.elf", mcu: "atmega328p" }))).toContain("-mmcu=atmega328p")
  })
  test("defines preserved, includes spliced before the input file", () => {
    const a = buildAvrCompileArgs({ cPath: "in.c", elfPath: "out.elf", defines: ["-DX=1"], includes: ["inc"] })
    expect(args(a)).toContain("-DX=1")
    expect(a.indexOf("-Iinc")).toBeLessThan(a.indexOf("in.c"))
  })
})

describe("avr-gcc — buildSimavrArgs", () => {
  test("mcu + freq from opts (simavr flag forms: -m, -f)", () => {
    expect(args(buildSimavrArgs("atmega2560", "16000000", "f.hex"))).toContain("-m atmega2560")
    expect(args(buildSimavrArgs("atmega2560", "16000000", "f.hex"))).toContain("-f 16000000")
  })
  test("defaults applied when omitted", () => {
    expect(args(buildSimavrArgs(undefined, undefined, "f.hex"))).toContain(`-m ${DEFAULT_AVR_MCU}`)
    expect(args(buildSimavrArgs(undefined, undefined, "f.hex"))).toContain(`-f ${DEFAULT_AVR_FREQ}`)
  })
})

describe("avr-gcc — normalizeSimavrOut", () => {
  test("strips simavr banners, ANSI wrap and trailing dots", () => {
    // Exact byte shape observed on WSL simavr: banners on stdout, UART bytes
    // ANSI-wrapped on stderr ("42.." — the ".." is simavr's own decoration)
    const raw = "Loaded 1 section of ihex\nLoad HEX flash 00000000, 1722\n\x1b[32m42..\n\x1b[0msignal caught, simavr terminating\n"
    expect(normalizeSimavrOut(raw)).toBe("42")
  })
  test("keeps multi-line program output and CRLF, drops blank lines", () => {
    const raw = "Loaded 1 section of ihex\r\n\x1b[32ma..\r\nb..\r\n\x1b[0m\r\n"
    expect(normalizeSimavrOut(raw)).toBe("a\nb")
  })
  test("ANSI codes inside a line are removed too", () => {
    expect(normalizeSimavrOut("\x1b[32mx\x1b[0my..\n")).toBe("xy")
  })
  test("silent firmware → empty output (banners only)", () => {
    expect(normalizeSimavrOut("Loaded 1 section of ihex\nsignal caught, simavr terminating\n")).toBe("")
  })
})

describe("wasm — buildEmccArgs", () => {
  test("TSC_WASM define present by default (runtime.h WASM branches active)", () => {
    expect(args(buildEmccArgs({ cPath: "in.c", jsPath: "out.js" }))).toContain(`-D${TSC_DEFINES.WASM}`)
  })
  test("CLI parity: -sWASM=1 -sSTANDALONE_WASM=1 always on", () => {
    const a = args(buildEmccArgs({ cPath: "in.c", jsPath: "out.js" }))
    expect(a).toContain("-sWASM=1")
    expect(a).toContain("-sSTANDALONE_WASM=1")
  })
  test("user defines and extra flags preserved", () => {
    const a = buildEmccArgs({ cPath: "in.c", jsPath: "out.js", defines: ["MY=1"], extraFlags: ["-O2"] })
    expect(args(a)).toContain("-DMY=1")
    expect(args(a)).toContain("-O2")
  })
})

describe("ndk-clang — androidTargetFlagFor", () => {
  test("default/unknown ABI falls back to arm64 (API level pinned)", () => {
    expect(androidTargetFlagFor(undefined)).toBe("--target=aarch64-linux-android24")
    expect(androidTargetFlagFor(null)).toBe("--target=aarch64-linux-android24")
    expect(androidTargetFlagFor("armeabi-v7a")).toBe("--target=aarch64-linux-android24")
  })
  test("device ABI maps to its triple — emulators are x86_64", () => {
    expect(androidTargetFlagFor("arm64-v8a")).toBe("--target=aarch64-linux-android24")
    expect(androidTargetFlagFor("x86_64")).toBe("--target=x86_64-linux-android24")
  })
})

describe("ndk-clang — adb run protocol", () => {
  test("shell command echoes the exit-code marker after the binary", () => {
    expect(buildAdbShellArgs("/data/local/tmp/tsc_1").join(" ")).toBe("shell /data/local/tmp/tsc_1; echo __TSC_EXIT:$?")
  })
  test("parseAdbRunOut splits program stdout from the marker", () => {
    const ok = parseAdbRunOut("42\n__TSC_EXIT:0\n")
    expect(ok.exitCode).toBe(0)
    expect(ok.stdout).toBe("42")
    const segv = parseAdbRunOut("boom\n__TSC_EXIT:139\n")
    expect(segv.exitCode).toBe(139)
    expect(segv.stdout).toBe("boom")
  })
  test("parseAdbRunOut normalizes CRLF transports and multi-line output", () => {
    const r = parseAdbRunOut("a\r\nb\r\n__TSC_EXIT:0\r\n")
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe("a\nb")
  })
  test("missing marker (timeout/transport drop) reports no exit code", () => {
    expect(parseAdbRunOut("partial output").exitCode).toBe(null)
  })
  test("adbHasDevice accepts ready devices only, not offline/unauthorized", () => {
    expect(adbHasDevice("List of devices attached\nemulator-5554\tdevice\n")).toBe(true)
    expect(adbHasDevice("List of devices attached\nemulator-5554\toffline\n")).toBe(false)
    expect(adbHasDevice("List of devices attached\n0123456789ABCDEF\tunauthorized\n")).toBe(false)
    expect(adbHasDevice("List of devices attached\n")).toBe(false)
  })
})

describe("ios-sim — iosSimTripleFor", () => {
  test("arm64 hosts get the arm64 simulator triple", () => {
    expect(iosSimTripleFor("arm64")).toBe("arm64-apple-ios16.0-simulator")
    expect(iosSimTripleFor(undefined)).toBe("arm64-apple-ios16.0-simulator")
  })
  test("intel hosts fall back to the x86_64 simulator triple", () => {
    expect(iosSimTripleFor("x64")).toBe("x86_64-apple-ios16.0-simulator")
  })
})

describe("platformMatrix — honest target→backend model", () => {
  const profilesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "compiler", "src", "profiles")

  test("every compiler profile has an entry", () => {
    const profiles = readdirSync(profilesDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
    for (const p of profiles) {
      expect(String(platformMatrix.targetBackends.some(t => t.target === p))).toBe("true")
    }
  })
  test("runnable targets map to a registered backend", () => {
    for (const t of platformMatrix.targetBackends) {
      if (t.backend === null) continue
      expect(String(platformMatrix.compilers.includes(t.backend))).toBe("true")
    }
  })
  test("unavailable targets declare backend null with a note", () => {
    for (const t of platformMatrix.targetBackends) {
      if (t.backend !== null) continue
      expect(String((t.note ?? "").length > 0)).toBe("true")
    }
  })
  test("legacy targets field = exactly the runnable subset", () => {
    const runnable = platformMatrix.targetBackends.filter(t => t.backend !== null).map(t => t.target)
    expect(platformMatrix.targets.join(",")).toBe(runnable.join(","))
  })
})
