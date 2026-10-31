// Self-test: beforeAll/afterAll hooks — lazy before first test, run at describe exit
// Ref: #206 step 4 (bug 3)
import { describe, test, expect, before, after, beforeEach, afterEach, getResults } from "../src/engine.ts"

const calls: string[] = []

describe("hooks — lifecycle order", () => {
  before(() => calls.push("beforeAll"))
  after(() => calls.push("afterAll"))
  beforeEach(() => calls.push("beforeEach"))
  afterEach(() => calls.push("afterEach"))

  test("first test", () => { calls.push("t1") })
  test("second test", () => { calls.push("t2") })
})

describe("hooks — verification", () => {
  test("full order: beforeAll once, lazy, afterAll at describe exit", () => {
    expect(calls.join(",")).toBe("beforeAll,beforeEach,t1,afterEach,beforeEach,t2,afterEach,afterAll")
  })
})

const emptyCalls: string[] = []
describe("hooks — empty context", () => {
  before(() => emptyCalls.push("beforeAll"))
  after(() => emptyCalls.push("afterAll"))
  // no tests here
})

test("beforeAll is lazy — never runs for a describe without tests; afterAll still runs", () => {
  expect(emptyCalls.join(",")).toBe("afterAll")
})

const nested: string[] = []
describe("hooks — nested", () => {
  before(() => nested.push("outer:beforeAll"))
  beforeEach(() => nested.push("outer:beforeEach"))
  describe("inner", () => {
    before(() => nested.push("inner:beforeAll"))
    test("inner test", () => nested.push("it"))
  })
})

test("nested: outer beforeAll → inner beforeAll → beforeEach chain → test", () => {
  expect(nested.join(",")).toBe("outer:beforeAll,inner:beforeAll,outer:beforeEach,it")
})

test("failing beforeAll fails its tests with a setup error, callback not executed", () => {
  // Sandbox: splice results out, run a poisoned describe, assert, restore —
  // the expected failure must not leak into the suite totals (xfail lands in step 9)
  const saved = getResults().splice(0)
  const seen: string[] = []
  try {
    describe("poison sandbox", () => {
      before(() => { seen.push("beforeAll"); throw new Error("setup exploded") })
      test("inner", () => { seen.push("never") })
    })
    const rs = getResults()
    expect(String(rs.length)).toBe("1")
    expect(String(rs[0].passed)).toBe("false")
    expect(rs[0].error ?? "").toContain("beforeAll failed")
    expect(seen.join(",")).toBe("beforeAll")
  } finally {
    // drop sandbox results, restore the real ones — order matters
    getResults().splice(0)
    getResults().push(...saved)
  }
})
