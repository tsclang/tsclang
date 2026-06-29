import { describe, test, run, expect, beforeEach } from '../engine.js'

let counter = 0

describe('hooks', () => {
  beforeEach(() => { counter = 0 })

  test('counter starts at 0', () => {
    expect(run('console.log(0)')).toBe('0')
  })

  test('counter still 0 after test', () => {
    expect(run('console.log(0)')).toBe('0')
  })
})
