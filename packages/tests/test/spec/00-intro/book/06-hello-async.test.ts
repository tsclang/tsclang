// Book coverage: packages/spec/book/00-intro/00.6-hello-async/ (4 chapters).
// The fetch/delay examples in 00.6.2/00.6.3/00.6.4 are marked «Концептуальный
// пример» in the book itself (delay/fetch/digital_write are not built-ins) —
// we test await with our own async function instead (00.6.1 state machine
// structure is testable as-is).

import { describe, expect, test, compile, run } from "@tsclang/test-engine"

describe("00-intro/book — 00.6 hello async (00.6.1–00.6.4)", () => {
  // 00.6.1:5-9 — async main runs like a normal program
  test("00.6.1 async function main(): Promise<void> — запуск печатает hello async", () => {
    expect(run('async function main(): Promise<void> {\n    console.log("hello async");\n}')).toBe("hello async")
  })

  // 00.6.1:13-35 + 00.6.2 — the state-machine C, fragment by fragment
  test("00.6.1/00.6.2 SM-структура: main_state typedef + main_poll + poll loop", () => {
    const c = compile('async function main(): Promise<void> {\n    console.log("hello async");\n}')
    expect(c).toContain("typedef struct { int32_t _state; bool _done; } main_state;")
    expect(c).toContain("static void main_poll(main_state *self) {")
    expect(c).toContain("main_state _main_sm = {0};")
    expect(c).toContain("while (!_main_sm._done) {")
    expect(c).toContain("main_poll(&_main_sm);")
    expect(c).toContain('printf("hello async\\n");')
    expect(c).toContain("self->_done = true;")
  })

  // 00.6.1:42-47 — _state drives the switch; no await → single case 0
  test("00.6.2 без await — единственный case 0 в switch", () => {
    const c = compile('async function main(): Promise<void> {\n    console.log("hello async");\n}')
    expect(c).toContain("case 0:")
    expect(c).not.toContain("case 1:")
  })

  // 00.6.2:49-84 — «Каждый await = новый case в switch» (our own async fn,
  // since delay/fetch are not built-ins)
  test("00.6.2 await своей async-функции: запуск 42 + несколько case в SM", () => {
    const code = `
async function work(): Promise<i32> { return 42 }
async function main(): Promise<void> {
    let r = await work()
    console.log(r)
}
`
    expect(run(code)).toBe("42")
    const c = compile(code)
    expect(c).toContain("case 0:")
    expect(c.match(/case \d+:/g)?.length ?? 0).toBeGreaterThan(1)
  })

  // 00.6.1:70-103 + 00.6.3:1-17 — sync vs async C shape
  test("00.6.3 sync-код не порождает state machine, async — порождает", () => {
    const sync = compile('console.log("Hello!");')
    const async = compile('async function main(): Promise<void> {\n    console.log("Hello!");\n}')
    expect(sync).not.toContain("main_state")
    expect(sync).toContain('printf("Hello!\\n");')
    expect(async).toContain("main_state")
  })

  // 00.6.3:83-95 — no top-level await
  test("00.6.3 top-level await — ошибка компиляции", () => {
    expect(() => compile('const data = await fetch("https://api.example.com/data")')).toThrow()
  })

  // 00.6.4:15-43 — `async function main(): void` variant runs on avr-shape too
  test("00.6.4 async function main(): void — запуск печатает boot", () => {
    expect(run('async function main(): void {\n    console.log("boot");\n}')).toBe("boot")
  })

  // 00.6.4:24 presents `int _result` as the AVR state-struct difference.
  // Reality (#257): `_result` follows the *return type*, not the target —
  // `main(): void` adds `int _result` on desktop as well, and `Promise<void>`
  // omits it on both targets. The book compares an avr-void struct against a
  // desktop-Promise<void> struct (00.6.1), hence the apparent difference.
  // Also reality vs the book sample: on avr async is opt-in (profile default
  // async:"none" → E303), and under the static allocator every async function
  // must be @static (E301) — the compiling avr form is `@static async`.
  test("00.6.4 int _result следует из типа возврата void, а не из таргета avr", () => {
    expect(() => compile('async function main(): void {\n    console.log("boot");\n}', { target: "avr" })).toThrow()
    expect(() => compile('async function main(): void {\n    console.log("boot");\n}', { target: "avr", async: "sm" })).toThrow()

    const desktopVoid = compile('async function main(): void {\n    console.log("boot");\n}')
    const desktopPromise = compile('async function main(): Promise<void> {\n    console.log("boot");\n}')
    const avrVoid = compile('@static async function main(): void {\n    console.log("boot");\n}', { target: "avr", async: "sm" })
    const avrPromise = compile('@static async function main(): Promise<void> {\n    console.log("boot");\n}', { target: "avr", async: "sm" })

    expect(desktopVoid).toContain("int _result")
    expect(avrVoid).toContain("int _result")
    expect(desktopPromise).not.toContain("int _result")
    expect(avrPromise).not.toContain("int _result")
  })

  // 00.6.4:49 — the SM lives on the stack in main(), singleton per function
  test("00.6.4 SM-переменная размещена в main (на стеке, singleton)", () => {
    const c = compile('@static async function main(): void {\n    console.log("boot");\n}', { target: "avr", async: "sm" })
    const mainAt = c.indexOf("int main(void) {")
    expect(c.indexOf("main_state _main_sm = {0};")).toBeGreaterThan(mainAt)
  })
})
