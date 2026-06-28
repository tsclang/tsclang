import { describe, test } from '../engine'

describe('expect matchers', () => {
  test('toBe', {
    input: 'console.log(42)',
    expect: { toBe: 42 }
  })

  test('toBeGreaterThan', {
    input: 'console.log(100)',
    expect: { toBeGreaterThan: 50 }
  })

  test('toBeLessThan', {
    input: 'console.log(10)',
    expect: { toBeLessThan: 20 }
  })

  test('toContain', {
    input: 'console.log("hello world")',
    expect: { toContain: 'world' }
  })

  test('toBeTruthy', {
    input: 'console.log(1)',
    expect: { toBeTruthy: true }
  })

  test('toBeFalsy', {
    input: 'console.log(0)',
    expect: { toBeFalsy: true }
  })

  test('toBeNull', {
    input: 'console.log("null")',
    expect: { toBeNull: true }
  })

  test('toMatch regex', {
    input: `console.log("abc123")`,
    expect: { toMatch: '^[a-z]+[0-9]+$' }
  })
})