// Self-test: engine API — describe/test nesting, full names, execution order,
// one result per registered test
// Ref: #206 step 10
import { describe, test, expect, getResults } from "../src/engine.ts"

const order: string[] = []
describe("engine api — order", () => {
  test("first sibling", () => order.push("first"))

  describe("nested", () => {
    test("nested test", () => order.push("nested"))
  })

  test("after nested describe", () => order.push("after"))
})

test("full names chain with ' > '", () => {
  const names = getResults().map(r => r.name)
  expect(names.join("|")).toContain("engine api — order > nested > nested test")
})

test("interleaving preserved: nested describe runs between its siblings", () => {
  expect(order.join(",")).toBe("first,nested,after")
})

test("one result per registered test", () => {
  const rs = getResults().filter(r => r.name.startsWith("engine api — order"))
  expect(String(rs.length)).toBe("3")
  expect(String(rs.every(r => r.passed))).toBe("true")
})

test("root-level test names recorded verbatim, no context prefix", () => {
  // runs last among root tests of this file, so the earlier root results exist;
  // exact-equality match proves no context prefix was prepended
  const names = getResults().map(r => r.name)
  expect(String(names.includes("interleaving preserved: nested describe runs between its siblings"))).toBe("true")
  expect(String(names.includes("full names chain with ' > '"))).toBe("true")
})
