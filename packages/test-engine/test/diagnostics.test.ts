// Self-test: failure diagnostics — no failure stays "without a reason"
// Ref: #206 step 2 (bug 5)
import { describe, test, expect, run, formatFailure, getBackend, CompileError, RuntimeError } from "../src/engine.ts"
import { register, type CompilerBackend } from "../src/compilers/index.ts"
import { mkdtempSync, rmSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// Deterministic failing backend: compile dies with EMPTY stderr (the exact
// "invisible failure" shape observed with mingw gcc before the bash fix)
class FailingCompileBackend implements CompilerBackend {
  name = "fake-fail"
  isAvailable(): boolean { return true }
  compile(_cCode: string, outDir: string) {
    mkdirSync(outDir, { recursive: true })
    return { success: false, stderr: "", exitCode: 42 }
  }
  run(_binaryPath: string) {
    return { success: false, stdout: "", stderr: "", exitCode: 1 }
  }
}
register(new FailingCompileBackend())

// Compile succeeds, binary run fails with stderr — exercises engine's run phase
class FailingRunBackend implements CompilerBackend {
  name = "fake-runfail"
  isAvailable(): boolean { return true }
  compile(_cCode: string, outDir: string) {
    mkdirSync(outDir, { recursive: true })
    return { success: true, binaryPath: join(outDir, "fake.bin"), stderr: "", exitCode: 0 }
  }
  run(_binaryPath: string) {
    return { success: false, stdout: "partial output", stderr: "boom\nsignal 7", exitCode: 7 }
  }
}
register(new FailingRunBackend())

describe("failure diagnostics", () => {
  describe("formatFailure — every failure shows a reason", () => {
    test("empty error message is visible as (no message)", () => {
      expect(formatFailure({ name: "x", passed: false, error: "" })).toContain("(no message)")
    })

    test("undefined error message is visible as (no message)", () => {
      expect(formatFailure({ name: "x", passed: false })).toContain("(no message)")
    })

    test("engine phase is shown as [phase] prefix", () => {
      const line = formatFailure({ name: "x", passed: false, error: "boom", phase: "c-compile" })
      expect(line).toContain("[c-compile]")
      expect(line).toContain("boom")
    })

    test("multi-line stderr stays indented, not glued to first line", () => {
      const line = formatFailure({ name: "x", passed: false, error: "first line\nsecond line" })
      expect(line).toContain("first line\n    second line")
    })
  })

  describe("run() — phase context in thrown errors", () => {
    test("C-compile failure names backend, exit code, and empty stderr", () => {
      let message = ""
      try {
        run("console.log(1)", { compiler: "fake-fail" })
      } catch (e) {
        expect(e instanceof CompileError).toBe(true)
        message = (e as Error).message
      }
      expect(message).toContain("fake-fail")
      expect(message).toContain("42")
      expect(message).toContain("stderr empty")
    })

    test("runtime failure includes exit code AND stderr", () => {
      let message = ""
      try {
        run("console.log(1)", { compiler: "fake-runfail" })
      } catch (e) {
        expect(e instanceof RuntimeError).toBe(true)
        message = (e as Error).message
      }
      expect(message).toContain("exit code 7")
      expect(message).toContain("boom")
    })

    test("unavailable compiler error names the compiler", () => {
      let message = ""
      try {
        run("console.log(1)", { compiler: "no-such-cc" })
      } catch (e) {
        expect(e instanceof CompileError).toBe(true)
        message = (e as Error).message
      }
      expect(message).toContain("no-such-cc")
    })
  })

  describe("real gcc backend — stderr is captured", () => {
    test("invalid C produces non-empty stderr", () => {
      const backend = getBackend("gcc")
      if (!backend?.isAvailable()) return
      const dir = mkdtempSync(join(tmpdir(), "tsc-diag-cc-"))
      try {
        const res = backend.compile("int main(void) { this is not C }", dir)
        expect(res.success).toBe(false)
        expect((res.stderr ?? "").length > 0).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})
