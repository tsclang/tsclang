import { describe, test, run, expect } from '../engine.js'

describe('expect matchers', () => {
  test('toBe', () => {
    expect(run('console.log(42)')).toBe('42')
  })

  test('toBeGreaterThan', () => {
    expect(Number(run('console.log(100)'))).toBeGreaterThan(50)
  })

  test('toBeLessThan', () => {
    expect(Number(run('console.log(10)'))).toBeLessThan(20)
  })

  test('toContain', () => {
    expect(run('console.log("hello world")')).toContain('world')
  })

  test('toBeTruthy', () => {
    expect(run('console.log(1)')).toBeTruthy()
  })

  test('toBeFalsy', () => {
    expect(run('console.log(0)')).toBeFalsy()
  })

  test('toBeNull', () => {
    expect(run('console.log("null")')).toBeNull()
  })

  test('toMatch regex', () => {
    expect(run('console.log("abc123")')).toMatch('^[a-z]+[0-9]+$')
  })
})
