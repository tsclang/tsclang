import { describe, test, compile, expect } from "@tsclang/test-engine"

describe('async tests', () => {
  test('async function compiles', () => {
    const c = compile(`async function getValue(): i32 {
  return 42
}`)
    expect(c).toContain('getValue_poll')
  })
})
