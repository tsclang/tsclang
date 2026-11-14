// Self-test: toMatchC — C-snapshot matcher (inline compare + file snapshots)
// Ref: #207 P1.5 — secondary mode for codegen details invisible to behavior
import { describe, test, expect, beforeEach, after } from "../src/engine.ts"
import { existsSync, rmSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const fails = (fn: () => void) => expect(fn).toThrow()

const here = dirname(fileURLToPath(import.meta.url))
// Convention: snapshots live in __c-snapshots__/<test-file>.ts → <test-file>.jsonl
const snapFile = join(here, "__c-snapshots__", "snapshot.test.jsonl")

describe("toMatchC — inline", () => {
  test("equal code passes", () => {
    expect("int main(void) {\n    return 0;\n}\n").toMatchC("int main(void) {\n    return 0;\n}")
  })
  test("trailing whitespace and blank-line runs are normalized on both sides", () => {
    expect("int x = 1;   \n\n\n\nint y = 2;\n").toMatchC("int x = 1;\n\nint y = 2;")
  })
  test("different code throws", () => {
    fails(() => expect("int x = 1;").toMatchC("int x = 2;"))
  })
  test("diff message points at the first differing line", () => {
    try {
      expect("int a = 1;\nint b = 2;").toMatchC("int a = 1;\nint b = 3;")
      throw new Error("should have thrown")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      expect(msg).toContain("line 2")
    }
  })
  test("not.toMatchC", () => {
    expect("int x = 1;").not.toMatchC("int x = 2;")
    fails(() => expect("int x = 1;").not.toMatchC("int x = 1;"))
  })
})

describe("toMatchC — file snapshots", () => {
  let prevCi: string | undefined
  beforeEach(() => {
    rmSync(snapFile, { force: true })
    // These tests exercise the LOCAL mechanism (create/compare/rewrite); the
    // no-auto-create CI gate is covered by the "CI guard" suite below, which
    // manages process.env.CI itself. Drop CI for this suite so a CI runner
    // exercises the same path as a laptop.
    prevCi = process.env.CI
    delete process.env.CI
  })
  after(() => {
    rmSync(snapFile, { force: true })
    if (prevCi !== undefined) process.env.CI = prevCi
  })
  test("creates a missing snapshot and passes", () => {
    expect("int created = 1;").toMatchC()
    if (!existsSync(snapFile)) throw new Error("snapshot file was not created")
    const raw = readFileSync(snapFile, "utf8")
    if (!raw.includes("toMatchC — file snapshots > creates a missing snapshot and passes"))
      throw new Error("test key missing in snapshot file")
    if (!raw.includes("int created = 1;")) throw new Error("normalized C not stored in snapshot file")
  })

  test("identical code passes against the stored snapshot", () => {
    expect("int stable = 7;\n\n\n").toMatchC() // create
    expect("int stable = 7;").toMatchC()        // compare — passes
  })

  test("changed code fails against the stored snapshot", () => {
    expect("int v = 1;").toMatchC()               // create
    fails(() => expect("int v = 2;").toMatchC())  // compare — mismatch
  })

  test("TSC_SNAPSHOT_UPDATE=1 rewrites the stored snapshot", () => {
    expect("int u = 1;").toMatchC() // create
    const prev = process.env.TSC_SNAPSHOT_UPDATE
    process.env.TSC_SNAPSHOT_UPDATE = "1"
    try {
      expect("int u = 2;").toMatchC() // rewrite + pass
      process.env.TSC_SNAPSHOT_UPDATE = "" // compare against the rewritten value
      expect("int u = 2;").toMatchC()
    } finally {
      if (prev === undefined) delete process.env.TSC_SNAPSHOT_UPDATE
      else process.env.TSC_SNAPSHOT_UPDATE = prev
    }
  })
})

describe("toMatchC — CI guard", () => {
  beforeEach(() => { rmSync(snapFile, { force: true }) })
  after(() => { rmSync(snapFile, { force: true }) })

  test("CI=true: a missing snapshot fails instead of being created", () => {
    const prev = process.env.CI
    process.env.CI = "true"
    try {
      let threw = false
      try { expect("int ci = 1;").toMatchC() } catch { threw = true }
      if (!threw) throw new Error("missing snapshot must fail under CI=true")
      if (existsSync(snapFile)) throw new Error("snapshot file must not be written under CI=true")
    } finally {
      if (prev === undefined) delete process.env.CI
      else process.env.CI = prev
    }
  })

  test("CI=true: an existing snapshot still compares normally", () => {
    delete process.env.CI
    expect("int ci2 = 1;").toMatchC() // create outside CI
    const prev = process.env.CI
    process.env.CI = "true"
    try {
      expect("int ci2 = 1;").toMatchC() // stored snapshot — normal compare
      fails(() => expect("int ci2 = 2;").toMatchC()) // mismatch still detected
    } finally {
      if (prev === undefined) delete process.env.CI
      else process.env.CI = prev
    }
  })

  test("CI=true + TSC_SNAPSHOT_UPDATE=1: explicit rewrite stays allowed", () => {
    process.env.CI = "true"
    const prev = process.env.TSC_SNAPSHOT_UPDATE
    process.env.TSC_SNAPSHOT_UPDATE = "1"
    try {
      expect("int ci3 = 1;").toMatchC() // explicit update overrides the CI gate
      if (!existsSync(snapFile)) throw new Error("explicit update must write the snapshot file")
    } finally {
      if (prev === undefined) delete process.env.TSC_SNAPSHOT_UPDATE
      else process.env.TSC_SNAPSHOT_UPDATE = prev
      delete process.env.CI
    }
  })
})
