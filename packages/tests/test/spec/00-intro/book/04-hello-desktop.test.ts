// Book coverage: packages/spec/book/00-intro/00.4-hello-desktop/ (7 chapters).
// 00.4.2 (compile pipeline), 00.4.4 (CMakeLists — see 07-cli), 00.4.5 (run =
// build+exec), 00.4.6 (dev-loop/debug) are CLI-level and covered by the
// 13-build/cli dictionary suite; here we assert the language-level theses.

import { describe, expect, test, compile, run } from "@tsclang/test-engine"

describe("00-intro/book — 00.4 hello desktop (00.4.1–00.4.7)", () => {
  // 00.4.1:5-9 — the whole program is one console.log, no main, no imports
  test("00.4.1 hello.tsc запускается и печатает Hello, World!", () => {
    expect(run('console.log("Hello, World!");')).toBe("Hello, World!")
  })

  // 00.4.1:17-23 — the exact C skeleton the book shows
  test("00.4.1 C-скелет: include + int main(void) + TSC_INIT + printf + return 0", () => {
    const c = compile('console.log("Hello, World!");')
    for (const line of [
      '#include "runtime.h"',
      "int main(void) {",
      "    TSC_INIT();",
      '    printf("Hello, World!\\n");',
      "    return 0;",
      "}",
    ]) {
      expect(c).toContain(line)
    }
  })

  // 00.4.1:29-36 — semicolon is optional, and the C output is identical
  test("00.4.1 точка с запятой опциональна — C байт-в-байт одинаковый", () => {
    const noSemi = compile('console.log("Hello, World!")')
    const withSemi = compile('console.log("Hello, World!");')
    expect(noSemi).toBe(withSemi)
    expect(run('console.log("Hello, World!")')).toBe("Hello, World!")
  })

  // 00.4.7:23-33 — the full top-level example
  const topLevel = `
let x: i32 = 42
const name = "TSClang"

function greet(who: string): void {
    console.log("Hello, " + who)
}

greet(name)
console.log("x =", x)
`

  test("00.4.7 top-level пример: запуск → Hello, TSClang / x = 42", () => {
    expect(run(topLevel)).toBe("Hello, TSClang\nx = 42")
  })

  // 00.4.7:37-55 — the generated C, fragment by fragment
  test("00.4.7 name mangling greet → greet_string", () => {
    expect(compile(topLevel)).toContain("void greet_string(String who) {")
  })

  test("00.4.7 конкатенация: tsc_string_concat + временная _tmp_0 + release", () => {
    const c = compile(topLevel)
    expect(c).toContain("String _tmp_0 = tsc_string_concat(STR_LIT(\"Hello, \"), who);")
    expect(c).toContain('printf("%s\\n", _tmp_0.data);')
    expect(c).toContain("tsc_string_release(_tmp_0);")
  })

  test("00.4.7 const сохраняется: const String name = STR_LIT(\"TSClang\")", () => {
    const c = compile(topLevel)
    expect(c).toContain('const String name = STR_LIT("TSClang");')
    expect(c).toContain("tsc_string_release(name);")
  })

  // 00.4.7:51 — i32 prints via %d (untyped number literal would use tsc_dtoa,
  // see 00.4.3 `console.log("count:", 3)` in 03-arch.test.ts)
  test("00.4.7 console.log(\"x =\", x) с i32 → printf(\"x = %d\\n\", x)", () => {
    expect(compile(topLevel)).toContain('printf("x = %d\\n", x);')
  })

  // 00.4.7:75-82 — variables live inside main(), functions are emitted before main
  test("00.4.7 переменные внутри main, функции до main, порядок сохранён", () => {
    const c = compile(topLevel)
    const mainAt = c.indexOf("int main(void) {")
    const greetAt = c.indexOf("void greet_string(String who) {")
    const xAt = c.indexOf("int32_t x = 42;")
    const callAt = c.indexOf("greet_string(name);")
    expect(greetAt).toBeGreaterThan(-1)
    expect(greetAt).toBeLessThan(mainAt)
    expect(xAt).toBeGreaterThan(mainAt)
    expect(callAt).toBeGreaterThan(xAt)
  })

  // 00.4.7:95 — a declarations-only file compiled standalone still gets an
  // (empty) main; the book's "no main" clause applies to files consumed as
  // imports by the CLI bundle, not to standalone compilation.
  test("00.4.7 файл только с объявлениями: standalone — пустой main (TSC_INIT + return 0)", () => {
    const c = compile("function f(): i32 { return 1 }")
    expect(c).toContain("int32_t f(void) {")
    expect(c.indexOf("int main(void) {")).toBeGreaterThan(0)
    expect(c).not.toContain("printf")
  })
})
