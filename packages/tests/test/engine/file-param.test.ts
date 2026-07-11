import { describe, test, compile, expect } from "@tsclang/test-engine"

describe("file parameter — positive", () => {
  test("reads .tsc file from disk", () => {
    const c = compile("packages/test-engine/src/tests/fixtures/math.tsc")
    expect(c).toContain("sum")
    expect(c).toContain("multiply")
  })

  test("recursive import — utils imports math", () => {
    const c = compile("packages/test-engine/src/tests/fixtures/utils.tsc")
    expect(c).toContain("sum")
    expect(c).toContain("addOne")
  })
})
