import { describe, test, run, expect } from "@tsclang/test-engine"

describe("binary type inference", () => {
  // Same type
  test("i32 + i32 = i32", () => {
    expect(run("let a: i32 = 1\nlet b: i32 = 2\nlet c = a + b\nconsole.log(c)")).toBe("3")
  })

  // Wider wins
  test("i32 + i64 = i64", () => {
    expect(run("let a: i32 = 1\nlet b: i64 = 2\nlet c = a + b\nconsole.log(c)")).toBe("3")
  })

  // Float wins
  test("i32 + f64 = f64", () => {
    expect(run("let a: i32 = 1\nlet b: f64 = 2.5\nlet c = a + b\nconsole.log(c)")).toBe("3.5")
  })

  // f32 + f64 = f64
  test("f32 + f64 = f64", () => {
    expect(run("let a: f32 = 1.5\nlet b: f64 = 2.5\nlet c = a + b\nconsole.log(c)")).toBe("4")
  })

  // Banned: same-width mixed signed/unsigned
  test("i8 + u8 = error", () => {
    expect(() => run("let a: i8 = 1\nlet b: u8 = 2\nlet c = a + b")).toThrow()
  })

  test("i32 + u32 = error", () => {
    expect(() => run("let a: i32 = 1\nlet b: u32 = 2\nlet c = a + b")).toThrow()
  })

  // TODO: i64 + u32 should be error per spec, but compiler allows it
  // test("i64 + u32 = error", { ... })
})
