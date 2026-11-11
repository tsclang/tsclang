// 4.3 (#277): a platform profile can point codegen at its own C-runtime
// header. Defaults: runtime.h (runtime_wasm.h for the wasm target); a profile
// with runtimeHeader: "runtime_spectrum.h" emits #include "runtime_spectrum.h".
// The header name must be a plain file name — path components are rejected,
// the value lands verbatim inside #include "..." of the generated C.

import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { compileTsc, parsePlatformDecl } from "../../../../../compiler/src/index.js"
import type { Capabilities } from "../../../../../compiler/src/index.js"
import { RUNTIME_WASM_LIB } from "../../../../../shared/src/toolchain.ts"

const here = dirname(fileURLToPath(import.meta.url))

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-rth-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

function compileWith(opts: { capabilities?: Capabilities | null; target?: string }): string {
  const dir = mkTmp()
  const file = join(dir, "main.tsc")
  writeFileSync(file, "function main(): void {}\n", "utf8")
  const r = compileTsc(file, opts)
  return r.c
}

describe("#277 runtimeHeader profile option", () => {
  test('default emit keeps #include "runtime.h"', () => {
    expect(compileWith({}).startsWith('#include "runtime.h"')).toBe(true)
  })

  test("wasm target keeps runtime_wasm.h without an override", () => {
    expect(compileWith({ target: "wasm" }).startsWith('#include "runtime_wasm.h"')).toBe(true)
  })

  test("profile runtimeHeader overrides the include", () => {
    const c = compileWith({ capabilities: { runtimeHeader: "runtime_spectrum.h" } })
    expect(c.startsWith('#include "runtime_spectrum.h"')).toBe(true)
  })

  test("parsePlatformDecl accepts a plain header name", () => {
    const caps = parsePlatformDecl('declare platform {\n    runtimeHeader: "runtime_spectrum.h"\n}')
    expect(caps?.runtimeHeader).toBe("runtime_spectrum.h")
  })

  test("parsePlatformDecl rejects path components in the header name", () => {
    const src = 'declare platform {\n    runtimeHeader: "../evil.h"\n}\n'
    expect(() => parsePlatformDecl(src)).toThrow(undefined, "plain header file name")
  })
})

// ── wasm runtime: env.log JS library (#278) ─────────────────────────────────
// runtime_wasm.h imports env.log(ptr, len) for console.log; emcc requires a
// JS definition of every referenced symbol, so the build passes the library
// next to the header via --js-library. Smoke: the file exists under the
// shared RUNTIME_WASM_LIB name and declares the imported `log`.

describe("#278 wasm runtime JS library", () => {
  const runtimeDir = join(here, "..", "..", "..", "..", "..", "..", "packages", "compiler", "src", "runtime")

  test("runtime_wasm_lib.js существует рядом с runtime_wasm.h и объявляет log", () => {
    const libPath = join(runtimeDir, RUNTIME_WASM_LIB)
    expect(existsSync(libPath)).toBe(true)
    const src = readFileSync(libPath, "utf8")
    expect(src.includes("LibraryManager.library")).toBe(true)
    expect(src.includes("log(")).toBe(true)
  })

  test("runtime_wasm.h импортирует env.log — контракт библиотеки", () => {
    const src = readFileSync(join(runtimeDir, "runtime_wasm.h"), "utf8")
    expect(src.includes('import_name("log")')).toBe(true)
  })
})
