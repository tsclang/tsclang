import { describe, test, beforeEach, afterEach } from '../engine.js'

let counter = 0

describe('hooks', () => {
  beforeEach(() => { counter = 0 })
  
  test('counter starts at 0', {
    input: 'console.log(0)',
    expect: { toBe: 0 }
  })
  
  test('counter still 0 after test', {
    input: 'console.log(0)',
    expect: { toBe: 0 }
  })
})