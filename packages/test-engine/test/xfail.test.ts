// Self-test: xfail / known-bug model — expected failures don't paint the run
// red, unexpectedly passing xfail tests surface as XPASS (remove the marker)
// Ref: #206 step 9
import { describe, test, expect, getResults } from "../src/engine.ts"

describe("xfail — known failures", () => {
  test("still broken (marker makes it xfailed)", () => {
    throw new Error("known bug")
  }, { xfail: "#206" })

  test("xfail result carries the marker and the raw outcome", () => {
    const rs = getResults()
    const idx = rs.findIndex(r => r.name === "xfail — known failures > still broken (marker makes it xfailed)")
    expect(String(idx >= 0)).toBe("true")
    expect(String(rs[idx].passed)).toBe("false")        // it really failed
    expect(rs[idx].error ?? "").toContain("known bug")  // reason preserved
    expect(rs[idx].xfail ?? "").toBe("#206")            // marker recorded
  })
})

describe("xfail — unexpectedly passing", () => {
  test("bug apparently fixed (should be xpass)", () => {
    expect("42").toBe("42")
  }, { xfail: "#206" })

  test("xpass result is passing but still marked", () => {
    const rs = getResults()
    const idx = rs.findIndex(r => r.name === "xfail — unexpectedly passing > bug apparently fixed (should be xpass)")
    expect(String(idx >= 0)).toBe("true")
    expect(String(rs[idx].passed)).toBe("true")
    expect(rs[idx].xfail ?? "").toBe("#206")
  })
})
