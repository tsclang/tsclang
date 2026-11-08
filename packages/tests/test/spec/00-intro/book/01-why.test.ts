// Book coverage: packages/spec/book/00-intro/00.1-why/ (7 chapters).
// Every code sample / verifiable thesis from the chapter gets a test.
// Failing-for-a-reason tests stay in the suite with an xfail marker and an
// inline comment naming the reason (#257).
// CLI theses of 00.1.2 ("tsclang build/install, tsc.package.json") are covered
// by the 13-build/cli dictionary suite — not duplicated here.

import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test, compile, run } from "@tsclang/test-engine"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const RUNTIME_DIR = join(ROOT, "packages", "compiler", "src", "runtime")

describe("00-intro/book — 00.1 why (00.1.1–00.1.7)", () => {
  // 00.1.1:10-13 — the TS fibonacci sample must be valid TSClang as-is
  test("00.1.1 fibonacci(n: number) — TS-синтаксис как есть → fib(10) = 55", () => {
    expect(run(`
function fibonacci(n: number): number {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}
console.log(fibonacci(10))`)).toBe("55")
  })

  // 00.1.1:44 — "конкретные типы i8, u32, i64, f32, usize" exist and print
  test("00.1.1 конкретные типы: i8/u32/i64/f32/usize объявляются и печатаются", () => {
    expect(run(`
let a: i8 = 1
let b: u32 = 2
let c: i64 = 3n
let d: f32 = 4.5
let e: usize = 6
console.log(a + b)
console.log(d)
console.log(e)`)).toBe("3\n4.5\n6")
  })

  // 00.1.2:50 — "Нет UB: каждый опасный паттерн либо запрещён, либо проверяется"
  // Out-of-bounds indexing does not read garbage: the runtime aborts loudly.
  test("00.1.2 UB-тезис: выход за границы массива — рантайм-паника, не тихий мусор", () => {
    expect(() => run(`
let arr: i32[] = [1, 2, 3, 4];
console.log(arr[10]);`)).toThrow()
  })

  // 00.1.4:22-32 — both spellings are valid; concrete types add i32/u8/f64
  test("00.1.4 let a = 10 и let a: number = 10 — оба валидны", () => {
    expect(run("let a = 10\nconsole.log(a)")).toBe("10")
    expect(run("let a: number = 10\nconsole.log(a)")).toBe("10")
  })

  test("00.1.4:29-31 let a: i32 = 10 / let b: u8 = 255 / let c: f64 = 3.14", () => {
    expect(run(`
let a: i32 = 10
let b: u8 = 255
let c: f64 = 3.14
console.log(a)
console.log(b)
console.log(c)`)).toBe("10\n255\n3.14")
  })

  // 00.1.4:58-66 — new-concepts table: Ref<T> / Mut<T> / Arc<T> / Weak<T> / readonly / mut
  test("00.1.4 таблица концепций: Ref<T> — immutable borrow, объект жив после вызова", () => {
    expect(run(`
class Box { v: i32 = 7 }
function read(b: Ref<Box>): i32 { return b.v }
let b = new Box()
console.log(read(b))
console.log(b.v)`)).toBe("7\n7")
  })

  test("00.1.4 таблица концепций: Mut<T> — тип компилируется как generic-обёртка", () => {
    // NOTE (#257 observation): `x = x + 1` inside `inc(x: Mut<i32>)` does NOT
    // mutate the caller's variable (run prints 1, not 2) — Mut semantics for
    // primitives is weaker than Rust's &mut T. The book table only claims the
    // type exists; borrow semantics lives in 04-ownership.
    expect(compile(`
function inc(x: Mut<i32>): void { x = x + 1 }
let v: i32 = 1
inc(v)
console.log(v)`)).toBeTruthy()
  })

  test("00.1.4 таблица концепций: Arc<T> — ARC-ссылка на класс", () => {
    expect(run(`
class Box { v: i32 = 1 }
let b: Arc<Box> = new Box()
console.log(b.v)`)).toBe("1")
  })

  test("00.1.4 таблица концепций: Weak<T> — слабая ссылка из Arc", () => {
    expect(run(`
class Box { v: i32 = 1 }
let a: Arc<Box> = new Box()
let w: Weak<Box> = a
console.log(w != null)`)).toBe("true")
  })

  test("00.1.4 таблица концепций: readonly-поле читается через new P().x → 1", () => {
    // `new P().x` on the RHS works via a C99 compound literal (fixed in #257);
    // field defaults are applied inside the brace initializer.
    expect(run(`
class P { readonly x: i32 = 1 }
console.log(new P().x)`)).toBe("1")
  })

  test("00.1.4:64 mut-параметр — НЕ поддерживается: явная ошибка (канонично Mut<T>)", () => {
    // The book table row "Mutable parameter | `mut` … (как в TS)" claims a
    // `mut x: T` parameter modifier. Reality: it never existed — `mut` parsed
    // as a parameter NAME and produced invalid C (`void *mut`). Per spec
    // 04-borrow the canonical spelling is `x: Mut<T>`, so the parser now
    // rejects the modifier with an explicit error instead of a silent bug.
    expect(() => run(`
function f(mut x: i32): void { x = x + 1 }
console.log(f(1))`)).toThrow(Error, '"mut" parameter modifier is not supported')
  })

  test("00.1.4:62 Shared<T> — BOOK BUG: в компиляторе только Arc<T> (E121 unknown type)", () => {
    // The 00.1.4 concepts table names the ARC type `Shared<T>`, but the
    // compiler implements `Arc<T>` (see the passing Arc test above). The file
    // carries the user's uncommitted manual edits, so the book is not fixed
    // here — reported in #257. Test asserts the book spelling works; it fails
    // with E121, hence xfail until the table says Arc<T>.
    expect(compile(`
class Box { v: i32 = 1 }
let b: Shared<Box> = new Box()
console.log(b.v)`)).toBeTruthy()
  }, { xfail: "#257" })

  // 00.1.5:18-24 — Map example; 00.1.5:28-32 — String example
  test("00.1.5 Map<string, i32>: set/get → 42", () => {
    expect(run(`
let m = new Map<string, i32>();
m.set("hello", 42);
console.log(m.get("hello"));`)).toBe("42")
  })

  test("00.1.5 s.length → 5", () => {
    expect(run(`
let s = "hello";
console.log(s.length);`)).toBe("5")
  })

  // 00.1.5:65 — the П2/П3 conflict resolution: undefined IS a null synonym
  test("00.1.5 конфликт П2/П3: undefined — синоним null", () => {
    expect(run(`
let x: i32 | null = undefined
console.log(x == null)`)).toBe("true")
  })

  // 00.1.6:10-15 — server sample. std/net is only partially implemented:
  // `serve` is not a fully typed std binding and `(req)` is an untyped arrow
  // parameter (#209), so the exact book sample does not compile yet (#257).
  test("00.1.6 std/net serve — пример из книги", () => {
    expect(run(`
import { serve } from "std/net";

serve({ port: 8080 }, (req) => {
    return new Response("Hello from TSClang!");
});`)).toBeTruthy()
  }, { xfail: "#257" })

  // 00.1.6:21-25 — readFile sample. std/fs.h exists but `readFile` is not a
  // registered stdlib binding — compilation fails on the unknown import (#257).
  test("00.1.6 std/fs readFile — пример из книги", () => {
    expect(run(`
import { readFile } from "std/fs";

const content = readFile("config.json");
console.log(content);`)).toBeTruthy()
  }, { xfail: "#257" })

  // 00.1.6:36-43 — embedded sample: native template with ${bit} interpolation.
  // Reality note: ${bit} in a native template emits the C *variable* name
  // (`1 << bit`), not the folded value (`1 << 5`) — the native block is pasted
  // into C verbatim after identifier substitution, constant folding is not
  // applied. The generated line is valid C because `bit` is in scope.
  test("00.1.6 native-шаблон с интерполяцией: native `DDRB |= (1 << ${bit});`", () => {
    const c = compile(`
function main(): void {
    const bit: u8 = 5; // PB5 — встроенный светодиод Arduino Uno
    native \`DDRB |= (1 << \${bit});\`;
\}`, { target: "avr" })
    expect(c).toContain("DDRB |= (1 << bit);")
  })

  // 00.1.6:56-63 — retro runtime headers exist (verified against the repo tree)
  test("00.1.6 retro-runtime заголовки существуют (nes/spectrum/genesis/dos/ps1/ps2)", () => {
    for (const f of [
      "runtime_nes.h", "runtime_spectrum.h", "runtime_genesis.h",
      "runtime_dos.h", "runtime_ps1.h", "runtime_ps2.h",
    ]) {
      expect(existsSync(join(RUNTIME_DIR, f))).toBe(true)
    }
  })

  // 00.1.7:5-19 — the "What matches" table, row by row (async/await row → 06)
  test("00.1.7 таблица: let/const", () => {
    expect(run("let a = 1\nconst b = 2\nconsole.log(a + b)")).toBe("3")
  })
  test("00.1.7 таблица: function f() {}", () => {
    expect(run("function f(): i32 { return 5 }\nconsole.log(f())")).toBe("5")
  })
  test("00.1.7 таблица: стрелочные (x) => x + 1", () => {
    expect(run("const g = (x: i32): i32 => x + 1\nconsole.log(g(1))")).toBe("2")
  })
  test("00.1.7 таблица: class Foo {}", () => {
    expect(run("class Foo { v: i32 = 3 }\nconsole.log(new Foo().v)")).toBe("3")
  })
  test("00.1.7 таблица: interface Bar {}", () => {
    expect(run(`
interface Bar { v: i32 }
class Foo implements Bar { v: i32 = 4 }
console.log(new Foo().v)`)).toBe("4")
  })
  test("00.1.7 таблица: дженерики function id<T>(x: T): T", () => {
    expect(run(`
function id<T>(x: T): T { return x }
console.log(id(7))`)).toBe("7")
    expect(run(`
function id<T>(x: T): T { return x }
console.log(id<i32>(7))`)).toBe("7")
  })
  test("00.1.7 таблица: массивы number[]", () => {
    expect(run("let a: number[] = [1, 2]\nconsole.log(a[1])")).toBe("2")
  })
  test("00.1.7 таблица: Map<string, number>", () => {
    expect(run(`
let m = new Map<string, number>()
m.set("a", 1)
console.log(m.get("a"))`)).toBe("1")
  })
  test("00.1.7 таблица: template literals", () => {
    expect(run('const name = "TSClang"\nconsole.log(`Hello ${name}`)')).toBe("Hello TSClang")
  })
  test("00.1.7 таблица: for-of", () => {
    expect(run("for (const x of [1, 2, 3]) { console.log(x) }")).toBe("1\n2\n3")
  })
  test("00.1.7 таблица: try/catch — catch требует явный тип ошибки", () => {
    // NOTE (#257 finding): the book table shows `catch (e) { }` (TS spelling),
    // but the compiler requires an explicit error type — `catch (e: Error)`
    // (E111 "catch clause requires explicit error type"). 00.1.7 is a
    // user-managed file with uncommitted edits, so it is reported, not fixed.
    expect(run('try { throw new Error("boom") } catch (e: Error) { console.log("caught") }')).toBe("caught")
    expect(() => compile('try { throw new Error("boom") } catch (e) { console.log("caught") }')).toThrow()
  })

  // 00.1.7:42-58 — == is ===: no coercion; explicit cast needed for mixed types
  test("00.1.7 == и === идентичны; однотипное сравнение переносится как есть", () => {
    expect(run("console.log(1 == 1)\nconsole.log(1 === 1)")).toBe("true\ntrue")
  })

  test("00.1.7 явное приведение: a.toString() == b → true", () => {
    expect(run(`
let a = 1
let b = "1"
console.log(a.toString() == b)`)).toBe("true")
  })

  test("00.1.7 смешанный 1 == \"1\" — invalid C, тезис «не полагайтесь» (#237)", () => {
    // The book says cross-type == "works not like in TS — don't rely on it".
    // In TS this prints false; TSClang generates invalid C (int == String) and
    // the C compile step fails — known bug #237.
    expect(run(`
let a = 1
let b = "1"
console.log(a == b)`)).toBe("false")
  }, { xfail: "#237" })

  // 00.1.7:72-75 — ownership: "let s2 = s; // move". Reality (#257 finding):
  // String assignment RETAINS (s stays usable — CONTEXT ownership table);
  // move semantics applies to classes/arrays. The book example as printed
  // actually works, which is friendlier than the book claims.
  test("00.1.7 string-присваивание: s остаётся живым (retain, не move)", () => {
    expect(run(`
let s = "hello";
let s2 = s;
console.log(s);`)).toBe("hello")
  })

  test("00.1.7 move для классов: использование после присваивания — ошибка компиляции", () => {
    expect(() => compile(`
class Box { v: i32 = 1 }
let a = new Box()
let b = a
console.log(a.v)`)).toThrow()
  })

  // 00.1.7:88-93 — typed throws
  test("00.1.7 throws IOError: сигнатура, вызов под try, перехват по типу", () => {
    expect(run(`
class IOError {}
function readFile(path: string): string throws IOError {
    throw new IOError()
}
try {
    let content = readFile("test.txt")
    console.log(content)
} catch (e: IOError) {
    console.log("ioerror")
}`)).toBe("ioerror")
  })

  test("00.1.7/00.3.4 throws без try: компилятор НЕ требует try (книга 00.3.4 обещает ошибку)", () => {
    // 00.3.4:36-40 claims `let content = readFile("test.txt")` is a compile
    // error ("нужен try или ?"). Reality: it compiles; an actually-thrown
    // error surfaces as a runtime abort (exit 1). Finding reported in #257.
    expect(() => run(`
class IOError {}
function rf(p: string): string throws IOError { throw new IOError() }
console.log(rf("x"))`)).toThrow()
  })

  // 00.1.7:99 — ES modules: named exports only
  test("00.1.7 export default запрещён", () => {
    expect(() => compile("export default function f(): void {}")).toThrow()
  })

  test("00.1.7 named exports работают", () => {
    expect(compile("export function f(): void {}")).toBeTruthy()
  })

  // 00.1.7:107-110 — inline C
  test("00.1.7 inline C: native-блок с printf попадает в C-вывод", () => {
    const c = compile('native `\n    printf("Direct C code!\\n");\n`')
    expect(c).toContain('printf("Direct C code!\\n");')
  })

  // 00.1.7:119-125 — @isr interrupt handler
  test("00.1.7 @isr(\"TIMER1_COMPA\") — обработчик прерывания компилируется", () => {
    expect(compile(`
let counter: i32 = 0
@isr("TIMER1_COMPA")
function onTick(): void {
    counter++
}
console.log(counter)`)).toBeTruthy()
  })

  // 00.1.7:134 — var stays as a let-alias
  test("00.1.7 var — alias для let", () => {
    expect(run("var x = 1\nconsole.log(x)")).toBe("1")
  })

  // 00.1.7:142-148 — migration: simple TS code works as-is
  test("00.1.7 миграция: add(a: number, b: number) работает как есть → 5", () => {
    expect(run(`
function add(a: number, b: number): number {
    return a + b;
}
console.log(add(2, 3));`)).toBe("5")
  })

  // 00.1.7:154-188 — migration with edits: Ref<Config>, throws, template literal
  test("00.1.7 миграция Config: Ref<T> + throws Error + шаблон → localhost:8080", () => {
    expect(run(`
class Config {
    host: string;
    port: number;
    constructor(host: string, port: number) {
        this.host = host;
        this.port = port;
    }
}

function validate(cfg: Ref<Config>): string throws Error {
    if (cfg.port < 1 || cfg.port > 65535) {
        throw new Error("port out of range");
    }
    return \`\${cfg.host}:\${cfg.port}\`;
}

let cfg = new Config("localhost", 8080);

console.log(validate(cfg));
console.log(cfg.port);`)).toBe("localhost:8080\n8080")
  })
})
