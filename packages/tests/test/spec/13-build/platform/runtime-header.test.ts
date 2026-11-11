// 4.3 (#277): a platform profile can point codegen at its own C-runtime
// header. Defaults: runtime.h (runtime_wasm.h for the wasm target); a profile
// with runtimeHeader: "runtime_spectrum.h" emits #include "runtime_spectrum.h".
// The header name must be a plain file name — path components are rejected,
// the value lands verbatim inside #include "..." of the generated C.

import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { compileTsc, parsePlatformDecl } from "../../../../../compiler/src/index.js"
import type { Capabilities } from "../../../../../compiler/src/index.js"

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
