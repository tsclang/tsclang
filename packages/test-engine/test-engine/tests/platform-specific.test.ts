import { describe, test } from "../engine"

describe("platform-specific behavior", () => {
  // Float works on desktop
  test("float literal on desktop", {
    input: `let a: f64 = 3.14
console.log(a)`,
    options: { target: "desktop" },
    expect: { toBe: "3.14" }
  })

  // Float blocked on AVR (fpu: false)
  test("float literal on AVR", {
    input: `let a: f64 = 3.14
console.log(a)`,
    options: { target: "avr" },
    expectError: true
  })

  // Mixed int + float works on desktop
  test("int + float on desktop", {
    input: `let a: i32 = 1
let b = a + 0.8
console.log(b)`,
    options: { target: "desktop" },
    expect: { toBe: "1.8" }
  })

  // Mixed int + float blocked on AVR
  test("int + float on AVR", {
    input: `let a: i32 = 1
let b = a + 0.8
console.log(b)`,
    options: { target: "avr" },
    expectError: true
  })

  // Integer operations work on both platforms
  test("int + int on desktop", {
    input: `let a: i32 = 1
let b: i32 = 2
console.log(a + b)`,
    options: { target: "desktop" },
    expect: { toBe: 3 }
  })

  test("int + int on AVR", {
    input: `let a: i32 = 1
let b: i32 = 2
console.log(a + b)`,
    options: { target: "avr" },
    expect: { toBe: 3 }
  })
})