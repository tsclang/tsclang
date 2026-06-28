import { describe, test, eq } from "../engine"

// === file parameter — positive tests ===

describe("file parameter — positive", () => {
  test("reads .tsc file from disk", {
    file: "packages/test-engine/test-engine/tests/fixtures/math.tsc",
    expectCContains: ["sum", "multiply"]
  })

  test("recursive import — utils imports math", {
    file: "packages/test-engine/test-engine/tests/fixtures/utils.tsc",
    expectCContains: ["sum", "addOne"]
  })
})
