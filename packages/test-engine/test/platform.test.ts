// Self-test: platform matrix closure — AVR mcu/freq knobs, wasm defines,
// honest target→backend model
// Ref: #207 P1.6 — matrix MCU reachable from tests; wasm tested like prod;
// unavailable targets declared, not silently absent
import { describe, test, expect, platformMatrix } from "../src/engine.ts"
import { buildAvrCompileArgs, buildSimavrArgs, normalizeSimavrOut } from "../src/compilers/avr-gcc.ts"
import { buildEmccArgs } from "../src/compilers/wasm.ts"
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
