// Self-test: async test() callbacks — collect-then-run execution model
// Ref: #206 step 7 (bug 10a)
// describe/test only REGISTER; printSummary() executes the tree sequentially,
// awaiting callbacks that return Promises. Hook failures become failed results
// instead of crashing the runner (beforeEach/afterEach throws were uncaught before).
import { describe, test, expect, before, beforeEach, after, afterEach, getResults } from "../src/engine.ts"

// --- Registration phase must not execute anything ---------------------------------
const early: string[] = []
describe("async — deferred execution", () => {
  test("sync body runs only at printSummary time", () => { early.push("ran") })
})
if (early.length !== 0) throw new Error("collect-then-run violated: test executed during registration")

// --- Async callbacks ---------------------------------------------------------------
describe("async — callbacks", () => {
  test("awaited value can be asserted", async () => {
    const v = await Promise.resolve(42)
    expect(String(v)).toBe("42")
  })
})

// --- Sequential execution: no interleaving between tests ---------------------------
const seq: string[] = []
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
describe("async — sequential", () => {
  test("slow first", async () => {
    await delay(30)
    seq.push("slow")
  })
  test("fast second", () => {
    seq.push("fast")
  })
})
test("async tests run strictly in order — fast does not overtake slow", () => {
  expect(seq.join(",")).toBe("slow,fast")
})

// --- Async hooks --------------------------------------------------------------------
const hookOrder: string[] = []
describe("async — hooks", () => {
  before(async () => { await delay(1); hookOrder.push("beforeAll") })
  beforeEach(async () => { await delay(1); hookOrder.push("beforeEach") })
  after(() => { hookOrder.push("afterAll") })
  test("body", async () => { await delay(1); hookOrder.push("t") })
})
test("async hooks fire in lifecycle order", () => {
  expect(hookOrder.join(",")).toBe("beforeAll,beforeEach,t,afterAll")
})

// --- Rejected promise is a failed result, not an unhandled rejection ----------------
describe("async — rejection sandbox", () => {
  test("rejects after await", async () => {
    await Promise.resolve()
    throw new Error("async boom")
  })
})
test("rejected promise → failed result with the error message", () => {
  const rs = getResults()
  const idx = rs.findIndex(r => r.name === "async — rejection sandbox > rejects after await")
  expect(String(idx >= 0)).toBe("true")
  expect(String(rs[idx].passed)).toBe("false")
  expect(rs[idx].error ?? "").toContain("async boom")
  rs.splice(idx, 1) // sandbox failure must not leak into totals (xfail lands in step 9)
})

// --- Hook failures don't crash the runner -------------------------------------------
const beforeEachSeen: string[] = []
describe("failing beforeEach sandbox", () => {
  beforeEach(() => { throw new Error("per-test setup exploded") })
  test("victim", () => { beforeEachSeen.push("never") })
})
test("failing beforeEach → failed result, callback skipped, runner alive", () => {
  const rs = getResults()
  const idx = rs.findIndex(r => r.name === "failing beforeEach sandbox > victim")
  expect(String(idx >= 0)).toBe("true")
  expect(String(rs[idx].passed)).toBe("false")
  expect(rs[idx].error ?? "").toContain("beforeEach failed")
  expect(beforeEachSeen.join(",")).toBe("")
  rs.splice(idx, 1)
})

const afterEachSeen: string[] = []
describe("failing afterEach sandbox", () => {
  afterEach(() => { throw new Error("teardown exploded") })
  test("body", () => { afterEachSeen.push("ran") })
})
test("failing afterEach → synthetic failed result, body still counted", () => {
  const rs = getResults()
  const idx = rs.findIndex(r => r.name === "failing afterEach sandbox > body > afterEach")
  expect(String(idx >= 0)).toBe("true")
  expect(String(rs[idx].passed)).toBe("false")
  expect(rs[idx].error ?? "").toContain("afterEach failed")
  expect(afterEachSeen.join(",")).toBe("ran")
  rs.splice(idx, 1)
})
