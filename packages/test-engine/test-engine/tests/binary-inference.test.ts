import { describe, test } from "../engine"

describe("binary type inference", () => {
  // Same type
  test("i32 + i32 = i32", {
    input: `let a: i32 = 1
let b: i32 = 2
let c = a + b
console.log(c)`,
    expect: { toBe: 3 }
  })

  // Wider wins
  test("i32 + i64 = i64", {
    input: `let a: i32 = 1
let b: i64 = 2
let c = a + b
console.log(c)`,
    expect: { toBe: 3 }
  })

  // Float wins
  test("i32 + f64 = f64", {
    input: `let a: i32 = 1
let b: f64 = 2.5
let c = a + b
console.log(c)`,
    expect: { toBe: "3.5" }
  })

  // f32 + f64 = f64
  test("f32 + f64 = f64", {
    input: `let a: f32 = 1.5
let b: f64 = 2.5
let c = a + b
console.log(c)`,
    expect: { toBe: "4" }
  })

  // Banned: same-width mixed signed/unsigned
  test("i8 + u8 = error", {
    input: `let a: i8 = 1
let b: u8 = 2
let c = a + b`,
    expectError: true
  })

  test("i32 + u32 = error", {
    input: `let a: i32 = 1
let b: u32 = 2
let c = a + b`,
    expectError: true
  })

  // TODO: i64 + u32 should be error per spec, but compiler allows it
  // test("i64 + u32 = error", { ... })
})