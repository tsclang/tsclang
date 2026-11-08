// Book coverage: packages/spec/book/00-intro/00.3-arch/ (7 chapters).
// 00.3.1 pipeline order + CLI artifacts → 07-cli.test.ts (build behavior).
// The `codegen()` signature thesis (00.3.5:79) is internal API — not tested.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test, compile } from "@tsclang/test-engine"
import { lex, parse, KEYWORDS } from "@tsclang/compiler"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")

describe("00-intro/book — 00.3 arch (00.3.1–00.3.7)", () => {
  // 00.3.2:7-21 — token table for `let x: i32 = 42;`.
  // Reality note (#257): the lexer types keywords as IDENT; keyword-ness is a
  // KEYWORDS set flag, not a token type — the book's "keyword"/"keyword (type)"
  // rows are the conceptual classification. i32 is NOT in KEYWORDS.
  test("00.3.2 лексер: let x: i32 = 42; → 7 токенов в порядке", () => {
    const toks = lex("let x: i32 = 42;")
    expect(toks.slice(0, 7).map((t) => t.value).join(" ")).toBe("let x : i32 = 42 ;")
    // Punctuation tokens use their literal as the type id (TK.COLON = ':'),
    // so the type sequence mirrors the value sequence for puncts.
    expect(toks.slice(0, 7).map((t) => t.type).join(" ")).toBe("IDENT IDENT : IDENT = NUMBER ;")
    expect(KEYWORDS.has("let")).toBe(true)
    expect(KEYWORDS.has("i32")).toBe(false)
  })

  // 00.3.2:40 — token positions (file, line, column) for error messages
  test("00.3.2 лексер: позиции line/col заполнены и монотонны", () => {
    const toks = lex("let x\n= 42;")
    expect(toks.every((t) => t.line >= 1 && t.col >= 1)).toBe(true)
    expect(toks[2].line).toBe(2) // `=` after the newline
    expect(toks[1].endCol).toBeGreaterThan(toks[1].col)
  })

  // 00.3.2:44 — unterminated string is a lexer error (throws)
  test("00.3.2 незакрытая строка \"hello — ошибка лексера", () => {
    expect(() => lex('"hello')).toThrow(Error, "Unterminated string")
  })

  // 00.3.2:46 — 0xZZ. Reality note (#257): the lexer itself splits it into
  // NUMBER(0x) + IDENT(ZZ) without an error; the pipeline still rejects the
  // program later (semantic pass), so the thesis holds end-to-end.
  test("00.3.2 некорректное число 0xZZ — программа отвергается (лексер делит, семантика ловит)", () => {
    const toks = lex("0xZZ")
    expect(toks.slice(0, 2).map((t) => t.value).join(" ")).toBe("0x ZZ")
    expect(() => compile("let x: i32 = 0xZZ")).toThrow()
  })

  // 00.3.2:45 — illegal `@` outside a decorator. Reality (#233): unknown
  // decorators are silently ignored — `@ x` compiles. The book claims an error.
  test("00.3.2 @ вне декоратора — ошибка (книга) / молча игнорируется (#233)", () => {
    expect(() => compile("@ x\nconsole.log(1)")).toThrow()
  }, { xfail: "#233" })

  // 00.3.3:15-24 — the AST JSON for a var decl
  test("00.3.3 парсер: let x = 42 → VarDecl + Literal(litType number, value \"42\")", () => {
    const { ast, errors } = parse(lex("let x = 42;"))
    expect(errors.length).toBe(0)
    const decl = ast.body[0] as any
    expect(decl.kind).toBe("VarDecl")
    expect(decl.name).toBe("x")
    expect(decl.init.kind).toBe("Literal")
    expect(decl.init.litType).toBe("number")
    expect(decl.init.value).toBe("42")
  })

  // 00.3.3:24 — litType set: number, string, bool, null, char, bigint.
  // Reality note (#257): the boolean literal's litType is "bool", not
  // "boolean" as the book's AST example spells it.
  test("00.3.3 litType-набор литералов", () => {
    const litOf = (src: string) => (parse(lex(src)).ast.body[0] as any).init
    expect(litOf("let a = 42").litType).toBe("number")
    expect(litOf('let s = "x"').litType).toBe("string")
    expect(litOf("let b = true").litType).toBe("bool")
    expect(litOf("let n = null").litType).toBe("null")
    expect(litOf("let c = 'a'").litType).toBe("char")
    expect(litOf("let z = 42n").litType).toBe("bigint")
  })

  // 00.3.3:28-52 — AST node kinds smoke (table of main nodes)
  test("00.3.3 узлы AST: FuncDecl/ClassDecl/Interface/If/For/While/Binary/Call", () => {
    const { ast, errors } = parse(lex(`
function f(a: i32): i32 { return a + 1 }
class C { v: i32 = 1 }
interface I { w: i32 }
if (1 == 1) { console.log(1) }
for (let i = 0; i < 3; i++) { f(i) }
while (false) {}
match`))
    expect(errors.length).toBeGreaterThan(0) // bare `match` is incomplete input
    const kinds = new Set<string>()
    const walk = (n: any) => {
      if (!n || typeof n !== "object") return
      if (n.kind) kinds.add(n.kind)
      for (const k of Object.keys(n)) {
        const v = (n as any)[k]
        if (Array.isArray(v)) v.forEach(walk)
        else if (v && typeof v === "object") walk(v)
      }
    }
    walk(ast)
    for (const k of ["FuncDecl", "ClassDecl", "Interface", "If", "For", "While", "Binary", "Call", "Member", "Literal", "VarDecl"]) {
      expect(kinds.has(k)).toBe(true)
    }
  })

  // 00.3.3:64-66 — parser errors
  test("00.3.3 ошибки парсера: let = 42 / function f( / class { }", () => {
    for (const bad of ["let = 42", "function f(", "class { }"]) {
      const { errors } = parse(lex(bad))
      expect(errors.length).toBeGreaterThan(0)
    }
  })

  // 00.3.4:10-14 — inference: number (desktop defaultNumber = f64), string, boolean
  test("00.3.4 вывод типов: let x = 42 → double в C (defaultNumber f64)", () => {
    const c = compile("let x = 42")
    expect(c).toContain("double x = 42.0;")
  })

  // 00.3.4:20-22 — widening OK, narrowing requires an explicit cast
  test("00.3.4 widening i32 → f64 разрешён", () => {
    expect(compile(`
let a: i32 = 42;
let b: f64 = a;
console.log(b)`)).toBeTruthy()
  })

  test("00.3.4 narrowing i32 → u8 без cast — ошибка", () => {
    expect(() => compile(`
let a: i32 = 42;
let c: u8 = a;
console.log(c)`)).toThrow()
  })

  // 00.3.5:56-73 — the type mapping table, row by row
  test("00.3.5 type mapping: все 14 строк таблицы → C-типы", () => {
    const cases: Array<[string, string, string]> = [
      ["i8", "1", "int8_t v = 1;"],
      ["i16", "1", "int16_t v = 1;"],
      ["i32", "42", "int32_t v = 42;"],
      ["i64", "42n", "int64_t v = 42LL;"],
      ["u8", "255", "uint8_t v = 255U;"],
      ["u16", "1", "uint16_t v = 1U;"],
      ["u32", "1", "uint32_t v = 1U;"],
      ["u64", "1n", "uint64_t v = 1U;"],
      ["f32", "1.5", "float v = 1.5f;"],
      ["f64", "3.14", "double v = 3.14;"],
      ["boolean", "true", "bool v = true;"],
      ["usize", "1", "size_t v = 1U;"],
      ["isize", "1", "ptrdiff_t v = 1;"],
      ["string", '"s"', 'String v = STR_LIT("s");'],
    ]
    for (const [tsc, lit, cDecl] of cases) {
      const c = compile(`let v: ${tsc} = ${lit}\nconsole.log(v)`)
      expect(c).toContain(cDecl)
    }
  })

  // 00.3.5:39-42 — `let x = 42` → `double x = 42.0;`
  test("00.3.5 пример: let x = 42 → double x = 42.0", () => {
    const c = compile("let x = 42")
    expect(c).toContain("double x = 42.0;")
  })

  // 00.3.5:44-54 + 00.4.3 — console.log shapes
  test("00.3.5 console.log(\"hello world\") → printf напрямую", () => {
    expect(compile('console.log("hello world")')).toContain('printf("hello world\\n");')
  })

  test("00.3.5/00.4.3 console.log(42) → tsc_dtoa (JS-стиль печати чисел)", () => {
    expect(compile("console.log(42)")).toContain("tsc_dtoa(42.0)")
  })

  test("00.3.5/00.4.3 несколько аргументов мержатся в один printf", () => {
    expect(compile('console.log("count:", 3)')).toContain('printf("count: %s\\n", tsc_dtoa(3.0));')
  })

  // 00.3.6:69-82 — runtime file tree
  test("00.3.6 runtime-файлы по платформам существуют (полный список книги)", () => {
    const rt = join(ROOT, "packages", "compiler", "src", "runtime")
    for (const f of [
      "runtime.h", "runtime_wasm.h", "runtime_nes.h", "runtime_genesis.h",
      "runtime_spectrum.h", "runtime_dos.h", "runtime_ps1.h", "runtime_ps2.h",
    ]) {
      expect(existsSync(join(rt, f))).toBe(true)
    }
    expect(existsSync(join(rt, "avr"))).toBe(true)
    expect(existsSync(join(rt, "platforms"))).toBe(true)
    expect(existsSync(join(rt, "std"))).toBe(true)
  })

  // 00.3.6:9-17 — desktop C skeleton: runtime.h include, TSC_INIT, return 0
  test("00.3.6 desktop-скелет C: #include \"runtime.h\" + TSC_INIT + return 0", () => {
    const c = compile('console.log("Hello, World!")')
    expect(c).toContain('#include "runtime.h"')
    expect(c).toContain("TSC_INIT();")
    expect(c).toContain("return 0;")
  })

  // 00.3.7 — spec/test layout theses
  test("00.3.7 спека: 17 нумерованных секций в packages/spec/spec/", () => {
    const sections = readdirSync(join(ROOT, "packages", "spec", "spec"))
      .filter((d) => /^[01][0-9]-/.test(d))
    expect(sections.length).toBe(17)
  })

  test("00.3.7 каждый spec-файл несёт маркер Spec status (#205)", () => {
    const specDir = join(ROOT, "packages", "spec", "spec")
    const files: string[] = []
    for (const dir of readdirSync(specDir)) {
      if (!/^[01][0-9]-/.test(dir)) continue
      for (const f of readdirSync(join(specDir, dir))) {
        if (f.endsWith(".md") && f !== "index.md") files.push(join(specDir, dir, f))
      }
    }
    expect(files.length).toBeGreaterThan(60)
    for (const f of files) {
      expect(readFileSync(f, "utf8")).toContain("Spec status")
    }
  })

  test("00.3.7 тестовый корпус: секции NN-* + book/ в packages/tests/test/cases/", () => {
    const cases = readdirSync(join(ROOT, "packages", "tests", "test", "cases"))
    const numbered = cases.filter((d) => /^[01][0-9]-/.test(d))
    expect(numbered.length).toBeGreaterThan(14)
    expect(cases).toContain("book")
  })
})
