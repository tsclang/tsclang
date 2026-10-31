// Self-test: input hygiene — string/comment content must never divert code to
// the file path, compile always goes through compileTsc (import resolution,
// aliases, cycle detection), backend compile honors timeouts
// Ref: #206 step 8 (bugs 6, 8)
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { describe, test, expect, compile, run } from "../src/engine.ts"
import { getBackend } from "../src/compilers/index.ts"

describe("hygiene — code strings never mistaken for paths", () => {
  test("division in code compiles (contains '/')", () => {
    const c = compile("let a: i32 = 10 / 2\nconsole.log(a)")
    expect(c).toContain("int main")
  })

  test("backslash in string literal compiles (contains '\\')", () => {
    const c = compile('const s: string = "a\\\\b"')
    expect(c).toContain("int main")
  })

  test("'import ' inside a comment still runs", () => {
    expect(run("// docs say: import x from 'y'\nconsole.log(42)")).toBe("42")
  })

  test("'import ' inside a string literal still runs", () => {
    expect(run('console.log("import nothing")')).toBe("import nothing")
  })

  test("real .tsc path still compiles (path API intact)", () => {
    const c = compile("fixtures/hello.tsc")
    expect(c).toContain("int main")
  })
})

describe("hygiene — backend compile timeout", () => {
  const backend = getBackend("gcc")
  if (!backend || !backend.isAvailable()) {
    // nothing to test without a real toolchain — skip registration entirely
  } else {
    test("timeoutMs kill surfaces as a failed compile with a visible reason", () => {
      const outDir = mkdtempSync(join(tmpdir(), "tsclang-timeout-"))
      try {
        const r = backend.compile("int main(void){return 0;}", outDir, { timeoutMs: 1 })
        expect(String(r.success)).toBe("false")
        expect(r.stderr).toContain("ETIMEDOUT")
      } finally {
        rmSync(outDir, { recursive: true, force: true })
      }
    })
  }
})
