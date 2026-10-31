// Self-test: selective run (#207 P0.2) + JSON report (#207 P0.3)
// runSuite() executes an isolated tree: the global suite stays untouched,
// which is also the prerequisite for worker-based parallelism (P1.4).
import { mkdtempSync, rmSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  describe, test, expect, runSuite, writeReport, resolveCliArgs, getResults,
  type Summary,
} from "../src/engine.ts"

// Aliases used inside runSuite registrations — they must register into the
// isolated state, not the global one
import { describe as d, test as t, before, after } from "../src/engine.ts"

describe("selective run (filter / only / skip)", () => {
  test("filter: full-name substring selects tests; the rest count as skipped", async () => {
    const s = await runSuite(() => {
      t("alpha one", () => { throw new Error("must not run") })
      t("beta two", () => {})
    }, { filter: "beta" })
    expect(String(s.total)).toBe("2")
    expect(String(s.passed)).toBe("1")
    expect(String(s.failed)).toBe("0")
    expect(String(s.skipped)).toBe("1")
  })

  test("filter matches the describe context part of the full name", async () => {
    const s = await runSuite(() => {
      d("outer", () => {
        t("inside", () => { throw new Error("boom") })
      })
      t("plain", () => {})
    }, { filter: "outer" })
    expect(String(s.failed)).toBe("1")
    expect(String(s.skipped)).toBe("1")
  })

  test("test.skip: registered but never executed, counted as skipped", async () => {
    let ran = false
    const s = await runSuite(() => {
      t.skip("skipped one", () => { ran = true })
      t("runs", () => {})
    })
    expect(String(s.skipped)).toBe("1")
    expect(String(s.passed)).toBe("1")
    expect(String(ran)).toBe("false")
    const skipped = s.results.find(r => r.skipped)
    expect(skipped ? skipped.name : "").toBe("skipped one")
  })

  test("test.only: when present anywhere, every other test is skipped", async () => {
    const s = await runSuite(() => {
      t("ordinary", () => { throw new Error("must not run") })
      t.only("chosen", () => {})
      d("nested", () => {
        t("also ordinary", () => { throw new Error("must not run") })
      })
    })
    expect(String(s.passed)).toBe("1")
    expect(String(s.skipped)).toBe("2")
    expect(String(s.failed)).toBe("0")
  })

  test("skipped tests fire no hooks", async () => {
    const fired: string[] = []
    const s = await runSuite(() => {
      d("ctx", () => {
        before(() => { fired.push("beforeAll") })
        after(() => { fired.push("afterAll") })
        t.skip("nope", () => { fired.push("body") })
      })
    })
    expect(String(s.skipped)).toBe("1")
    expect(fired.join(",")).toBe("")
  })

  test("afterAll does not fire when every test of the context was filtered out", async () => {
    const fired: string[] = []
    const s = await runSuite(() => {
      d("ctx", () => {
        after(() => { fired.push("afterAll") })
        t("hidden", () => {})
      })
      t("visible", () => {})
    }, { filter: "visible" })
    expect(String(s.passed)).toBe("1")
    expect(fired.join(",")).toBe("")
  })

  test("runSuite leaves the global results untouched", async () => {
    const before = getResults().length
    await runSuite(() => { t("isolated", () => {}) })
    expect(String(getResults().length - before)).toBe("0")
  })
})

describe("JSON report + environment (#207 P0.3)", () => {
  test("summary carries environment and duration", async () => {
    const s: Summary = await runSuite(() => { t("ok", () => {}) })
    expect(s.environment.os).toBeTruthy()
    expect(s.environment.node).toMatch("^v\\d")
    expect(s.environment.backend).toBeTruthy()
    // toolchain is "" when the backend cannot report a version — but always a string
    expect(String(typeof s.environment.toolchain)).toBe("string")
    expect(String(s.durationMs >= 0)).toBe("true")
  })

  test("writeReport produces machine-readable JSON with counters and per-test results", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tsclang-report-"))
    try {
      const s = await runSuite(() => {
        t("pass", () => {})
        t("fail", () => { throw new Error("boom") })
        t("known", () => { throw new Error("known bug") }, { xfail: "#000" })
        t.skip("later", () => {})
      })
      const path = join(dir, "report.json")
      writeReport(s, path)
      const raw = JSON.parse(readFileSync(path, "utf8"))
      expect(String(raw.total)).toBe("4")
      expect(String(raw.passed)).toBe("1")
      expect(String(raw.failed)).toBe("1")
      expect(String(raw.xfailed)).toBe("1")
      expect(String(raw.skipped)).toBe("1")
      expect(String(raw.results.length)).toBe("4")
      const fail = raw.results.find((r: any) => r.name === "fail")
      expect(fail ? fail.error : "").toContain("boom")
      expect(String(typeof raw.environment.os)).toBe("string")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("resolveCliArgs: bare arg = filter, --json[=path] = report path", () => {
    const a = resolveCliArgs(["beta", "--json=out.json"])
    expect(a.filter ?? "").toBe("beta")
    expect(a.jsonPath ?? "").toBe("out.json")
    const b = resolveCliArgs(["--json"])
    expect(b.jsonPath ?? "").toBe("test-report.json")
    const c = resolveCliArgs(["--unknown-flag", "x"])
    expect(c.filter ?? "").toBe("x")
    expect(String(c.jsonPath === undefined)).toBe("true")
  })
})
