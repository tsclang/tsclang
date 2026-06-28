import { describe, test } from '../engine'

describe('async tests', () => {
  test('async function compiles', {
    input: `async function getValue(): i32 {
  return 42
}`,
    async: true,
    expectCContains: 'getValue_poll'
  })
})