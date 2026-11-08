// Book coverage: packages/spec/book/00-intro/00.5-hello-avr/ (5 chapters).
// 00.5.5 (flashing avrdude) is hardware-only — nothing to test in CI.

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test, compile } from "@tsclang/test-engine"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const RUNTIME_H = readFileSync(
  join(ROOT, "packages", "compiler", "src", "runtime", "runtime.h"),
  "utf8",
)

describe("00-intro/book — 00.5 hello avr (00.5.1–00.5.4)", () => {
  // 00.5.1:7-11 + 00.5.2:9-19 — the compiler emits byte-identical portable C
  // for every target; platform adaptation happens in runtime.h + the C toolchain
  test("00.5.1/00.5.2 portable C: desktop и AVR дают одинаковый C", () => {
    const code = 'console.log("Hello from AVR!");'
    expect(compile(code)).toBe(compile(code, { target: "avr" }))
  })

  test("00.5.2 printf генерируется всегда, даже для AVR-таргета", () => {
    expect(compile('console.log("Hello from AVR!");', { target: "avr" }))
      .toContain('printf("Hello from AVR!\\n");')
  })

  // 00.5.2:25 — runtime.h switches implementations behind #ifdef TSC_EMBEDDED
  test("00.5.2 runtime.h: #ifdef TSC_EMBEDDED переключает реализации", () => {
    expect(RUNTIME_H).toContain("#ifdef TSC_EMBEDDED")
  })

  // 00.5.2:33-54 — String struct: desktop has _refcount, embedded does not
  test("00.5.2 runtime.h: desktop String с _refcount, embedded — без", () => {
    expect(RUNTIME_H).toContain("_refcount")
    // the embedded branch must exist and drop ARC
    expect(RUNTIME_H).toMatch(/#ifdef TSC_EMBEDDED[\s\S]{0,400}?#else/)
  })

  // 00.5.2:56-68 — STR_LIT expands to PSTR(...) on AVR
  test("00.5.2 runtime.h: STR_LIT → PSTR на AVR (PROGMEM)", () => {
    expect(RUNTIME_H).toContain("PSTR(")
  })

  // 00.5.2:70-90 — retain/release are no-ops when embedded
  test("00.5.2 runtime.h: embedded retain/release — no-op", () => {
    const embeddedNoop = /static inline void tsc_string_retain\(String s\) \{ \(void\)s; \}/
    expect(RUNTIME_H).toMatch(embeddedNoop)
  })

  // 00.5.3:12-19 — the 256-byte ring buffer
  test("00.5.3 runtime.h: TSC_STR_POOL_SIZE 256 + static char _tsc_str_pool[...]", () => {
    expect(RUNTIME_H).toContain("#ifndef TSC_STR_POOL_SIZE")
    expect(RUNTIME_H).toContain("#define TSC_STR_POOL_SIZE 256")
    expect(RUNTIME_H).toContain("static char _tsc_str_pool[TSC_STR_POOL_SIZE];")
  })

  // 00.5.3:31-38 — arrays compile on avr (stack/BSS, no realloc)
  test("00.5.3 массив i32[] на avr компилируется", () => {
    expect(compile("let arr: i32[] = [1, 2, 3]", { target: "avr" })).toBeTruthy()
  })

  // 00.5.1:57-68 — «Что работает на AVR» checklist
  test("00.5.1 работает на avr: Map (static-ёмкость) / Volatile / @isr / классы", () => {
    // Reality (#257): on avr the allocator is static, so `new Map<K,V>()`
    // without a capacity is rejected (E301, help: "provide a capacity argument
    // for static allocation"). The checklist item holds via `new Map<K,V>(N)`.
    expect(() => compile(`
let m: Map<string, i32> = new Map<string, i32>()
m.set("a", 1)
`, { target: "avr" })).toThrow()

    expect(compile(`
let m = new Map<string, i32>(32)
m.set("a", 1)
`, { target: "avr" })).toBeTruthy()

    expect(compile("const reg: Volatile<u32> = 0x40020000 as Volatile<u32>", { target: "avr" })).toBeTruthy()

    expect(compile(`
let counter: i32 = 0
@isr("TIMER1_COMPA")
function onTick(): void { counter++ }
`, { target: "avr" })).toBeTruthy()

    expect(compile("class P { x: i32 = 1 }", { target: "avr" })).toBeTruthy()
  })

  // 00.5.1:73 — «Shared<T> / Weak<T> не работают (нет ARC)»: on the static
  // allocator the compiler rejects `new Arc<T>(...)` with E301 already at
  // compile time ("requires heap allocation (ARC)"), no avr-gcc needed.
  test("00.5.1 Arc на avr отклоняется компилятором (E301, static allocator)", () => {
    expect(() => compile(`
class Box { v: i32 = 1 }
let a: Arc<Box> = new Arc<Box>(new Box())
`, { target: "avr" })).toThrow()
  })

  // 00.5.4:8 — numbers never rely on printf %f: tsc_dtoa even on avr
  test("00.5.4 console.log(\"count:\", 3) на avr → tsc_dtoa, не %f", () => {
    const c = compile('console.log("count:", 3);', { target: "avr" })
    expect(c).toContain('printf("count: %s\\n", tsc_dtoa(3.0));')
    expect(c).not.toContain("%f")
  })

  // 00.5.4:31-41 — the book shows a `native { ... }` block. Reality (#257):
  // the implementation has no brace-form native blocks — the syntax is the
  // template literal `native \`...\`` (as used in 00.1.6/00.1.7). The book
  // example below throws; the equivalent template-literal form is covered by
  // the next test.
  test("00.5.4 native { } блок из книги — синтаксис не существует (реальный: native `...`)", () => {
    expect(() => compile(`
@inline
function uart_print(s: string): void {
    native {
        for (size_t i = 0; i < s.length; i++) {
            while (!(UCSR0A & (1 << UDRE0)));
            UDR0 = s.data[i];
        }
    }
}
`, { target: "avr" })).toThrow()
  })

  test("00.5.4 прямой UART-вывод через native-шаблон компилируется на avr", () => {
    const c = compile(`
function uart_print(s: string): void {
    native \`
        for (size_t i = 0; i < \${s}.length; i++) {
            while (!(UCSR0A & (1 << UDRE0)));
            UDR0 = \${s}.data[i];
        }
    \`;
}
`, { target: "avr" })
    expect(c).toContain("void uart_print_string(String s) {")
    expect(c).toContain("for (size_t i = 0; i < s.length; i++)")
    expect(c).toContain("UDR0 = s.data[i];")
  })
})
