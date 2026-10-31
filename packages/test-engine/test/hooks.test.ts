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

// Sandbox: a poisoned describe registered at top level, verified by the test
// right after it. Deferred execution: results only exist after the poison
// context has run, so assertions live in the following test. The deliberate
// failure carries an xfail marker and counts as xfailed, not red.
const poisonSeen: string[] = []
describe("hooks — poison sandbox", () => {
  before(() => { poisonSeen.push("beforeAll"); throw new Error("setup exploded") })
  test("inner", () => { poisonSeen.push("never") }, { xfail: "#206" })
})

test("failing beforeAll fails its tests with a setup error, callback not executed", () => {
  const rs = getResults()
  const idx = rs.findIndex(r => r.name === "hooks — poison sandbox > inner")
  expect(String(idx >= 0)).toBe("true")
  expect(String(rs[idx].passed)).toBe("false")
  expect(rs[idx].error ?? "").toContain("beforeAll failed")
  expect(rs[idx].xfail ?? "").toBe("#206")
  expect(poisonSeen.join(",")).toBe("beforeAll")
})
