import { describe, test, run, expect } from "@tsclang/test-engine"

describe("platform-specific behavior", () => {
  // Float works on desktop
  test("float literal on desktop", () => {
    expect(run("let a: f64 = 3.14\nconsole.log(a)", { target: "desktop" })).toBe("3.14")
  })

  // Float blocked on AVR (fpu: false)
  test("float literal on AVR", () => {
    expect(() => run("let a: f64 = 3.14\nconsole.log(a)", { target: "avr" })).toThrow()
  })

  // Mixed int + float works on desktop
  test("int + float on desktop", () => {
    expect(run("let a: i32 = 1\nlet b = a + 0.8\nconsole.log(b)", { target: "desktop" })).toBe("1.8")
  })

  // Mixed int + float blocked on AVR
  test("int + float on AVR", () => {
    expect(() => run("let a: i32 = 1\nlet b = a + 0.8\nconsole.log(b)", { target: "avr" })).toThrow()
  })

  // Integer operations work on both platforms
  test("int + int on desktop", () => {
    expect(run("let a: i32 = 1\nlet b: i32 = 2\nconsole.log(a + b)", { target: "desktop" })).toBe("3")
  })

  test("int + int on AVR", () => {
    expect(run("let a: i32 = 1\nlet b: i32 = 2\nconsole.log(a + b)", { target: "avr" })).toBe("3")
  })
})
