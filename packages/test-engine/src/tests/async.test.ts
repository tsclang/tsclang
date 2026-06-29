import { describe, test, compile, expect } from '../engine.js'

describe('async tests', () => {
  test('async function compiles', () => {
    const c = compile(`async function getValue(): i32 {
  return 42
}`)
    expect(c).toContain('getValue_poll')
  })
})
