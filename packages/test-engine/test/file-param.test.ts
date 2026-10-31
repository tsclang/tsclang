// Self-test: file()/compile(path) resolve from the calling test file,
// not from process.cwd() — pnpm --filter cwd must not matter
// Ref: #206 step 3 (bugs 4, 7)
import { describe, test, expect, file, compile } from "../src/engine.ts"
import { tmpdir } from "os"
import { join } from "path"

describe("file()/compile() — caller-relative resolution", () => {
  test("file() reads fixture relative to the test file", () => {
    expect(file("fixtures/hello.tsc")).toContain("console.log(42)")
  })

  test("file() works regardless of process.cwd()", () => {
    const original = process.cwd()
    try {
      process.chdir(tmpdir()) // simulate pnpm --filter running from anywhere
      expect(file("fixtures/hello.tsc")).toContain("console.log(42)")
    } finally {
      process.chdir(original)
    }
  })

  test("file() accepts absolute paths", () => {
    expect(file(join(import.meta.dirname!, "fixtures", "hello.tsc"))).toContain("console.log(42)")
  })

  test("compile(path) compiles a fixture relative to the test file", () => {
    const c = compile("fixtures/hello.tsc")
    expect(c).toContain("int main")
  })

  test("compile(path) works regardless of process.cwd()", () => {
    const original = process.cwd()
    try {
      process.chdir(tmpdir())
      const c = compile("fixtures/hello.tsc")
      expect(c).toContain("int main")
    } finally {
      process.chdir(original)
    }
  })
})
