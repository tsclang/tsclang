import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { lex } from '../../compiler/src/compiler/lexer.js'
import { parse } from '../../compiler/src/compiler/parser.js'
import { codegen } from '../../compiler/src/compiler/codegen.js'

export const matrix = {
  i8: {
    min: -128,
    max: 127,
    values: [0, 1, -128, 127, -129, 128]
  }
}

export interface EqExpectation {
  kind: 'eq'
  value: string | number
}

export function eq(value: string | number): EqExpectation {
  return { kind: 'eq', value }
}

export interface TestOptions {
  input: string
  expect?: EqExpectation
  expectError?: boolean
}

export interface TestResult {
  name: string
  passed: boolean
  actual?: string
  expected?: string
  error?: string
}

let results: TestResult[] = []
let currentDescribe = ''

export function describe(name: string, fn: () => void): void {
  const prev = currentDescribe
  currentDescribe = prev ? `${prev} > ${name}` : name
  fn()
  currentDescribe = prev
}

export function test(name: string, options: TestOptions): void {
  const fullName = currentDescribe ? `${currentDescribe} > ${name}` : name

  const tmpDir = mkdtempSync(join(tmpdir(), 'tsclang-test-engine-'))
  const cPath = join(tmpDir, 'input.c')
  const binPath = join(tmpDir, 'input')

  try {
    let c: string
    try {
      const tokens = lex(options.input, '<test>')
      const { ast, errors: parseErrors } = parse(tokens, '<test>', options.input)
      if (parseErrors.length > 0) {
        throw { isTscErrorBag: true, errors: parseErrors }
      }
      c = codegen(ast, '<test>', options.input).c
    } catch (e) {
      if (options.expectError) {
        results.push({ name: fullName, passed: true, error: 'compile error as expected' })
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ name: fullName, passed: false, error: `compile error: ${msg}` })
      return
    }

    if (options.expectError) {
      results.push({ name: fullName, passed: false, error: 'expected compile error, got success' })
      return
    }

    writeFileSync(cPath, c, 'utf8')
    const runtimeDir = join(process.cwd(), 'packages', 'compiler', 'src', 'runtime')
    const gcc = spawnSync('gcc', [cPath, '-o', binPath, `-I${runtimeDir}`, '-lpthread', '-std=c11'], { stdio: 'pipe' })
    if (gcc.status !== 0) {
      results.push({ name: fullName, passed: false, error: `gcc failed: ${gcc.stderr?.toString()}` })
      return
    }

    const run = spawnSync(binPath, [], { encoding: 'utf8' })
    const actual = run.stdout?.trim() ?? ''

    if (options.expect) {
      const expected = String(options.expect.value)
      if (actual === expected) {
        results.push({ name: fullName, passed: true, actual, expected })
      } else {
        results.push({ name: fullName, passed: false, actual, expected })
      }
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

export function getResults(): TestResult[] {
  return results
}

export function reset(): void {
  results = []
}

export function printSummary(): void {
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`\n${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const r of results.filter(x => !x.passed)) {
      console.log(`  ✗ ${r.name}`)
      if (r.expected !== undefined) console.log(`    expected: ${r.expected}`)
      if (r.actual !== undefined) console.log(`    actual:   ${r.actual}`)
      if (r.error) console.log(`    error:    ${r.error}`)
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}