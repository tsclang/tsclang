## Строки

> Spec status: unverified · #205

- Один тип `string` — UTF-8 байтовая последовательность
- Содержимое **immutable** (ARC Copy); `let` позволяет переприсвоить переменную, `const` — нет

### Escape-последовательности (#307)

Лексер декодирует escape-последовательности по семантике JavaScript/TypeScript (П2) — в строках (`"..."`) и символьных литералах (`'...'`):

| Последовательность | Значение |
|---|---|
| `\n` `\t` `\r` `\b` `\f` `\v` | соответствующий control-символ (LF, TAB, CR, backspace, form feed, vertical tab) |
| `\0` | NUL (байт 0); `\0` + цифра — ошибка |
| `\"` `\'` `\\` | `"`, `'`, `\` |
| `\xNN` | символ U+0000..U+00FF по 2 hex-цифрам (ровно 2, иначе ошибка) |
| `\uXXXX` | кодпоинт BMP по 4 hex-цифрам (ровно 4) |
| `\u{1..6 hex}` | кодпоинт до U+10FFFF |
| `\uD83D\uDE00` | суррогатная пара объединяется в один кодпоинт (U+1F600) |
| `\<перевод строки>` | line continuation — продолжение строки, символ перевода строки удаляется |
| `\q`, `\a` и др. неизвестные | backslash отбрасывается: `"\q" === "q"` (как в JS) |

Ошибки компиляции (лексер):

- `\u12"` (мало hex-цифр) — `Invalid Unicode escape sequence`
- `\x4"` — `Invalid hexadecimal escape sequence`
- `"\1"`..`"\9"` — `Octal escape sequences are not allowed` (strict-семантика JS)
- `"\ud83d"` без пары, `"\u{D800}"` — `Lone surrogate escape is not allowed`: строка — UTF-8 байты, одиночный суррогат в ней не представим (отличие от JS, где lone surrogate допустим)
- `"\u{110000}"` — `Unicode codepoint out of range`

Примеры:

```typescript
const a: string = "\u0041BC";       // "ABC", длина 3
const b: string = "\u0430";         // "а", длина 2 — .length считает UTF-8 байты
const c: string = "\u{1F600}";      // 😀, длина 4 байта
const d: string = "\ud83d\ude00";   // то же, что "\u{1F600}" — пара объединяется
const e: string = "\x41\x42";       // "AB"
const f = `tab:\t A:\u0041`;        // template literal — эскейпы декодируются так же
```

Кодогенерация повторно кодирует значение в C-эскейпы автоматически (`\n` остаётся `\n` в C-исходнике, `\` становится `\\` и т.д.) — пользователю это не видно.

**Исключение — native-блоки** (`native "..."` и ``native(`...`)``): содержимое — дословный C-код, escape-последовательности в нём интерпретирует C-компилятор (`native "printf(\"a\n\");"` печатает перевод строки через C-`\n`). See `12-modules`.

### C-layout

```c
#ifdef TSC_EMBEDDED
typedef struct {
    const char *data;
    size_t      length;
    size_t      capacity;   // 0 = rodata (литералы), >0 = heap
} String;
#else
typedef struct {
    const char *data;
    size_t      length;
    size_t      capacity;   // 0 = rodata (литералы), >0 = heap
    uint32_t   *_refcount;  // NULL for rodata, ARC for heap (desktop only)
} String;
#endif
```

`string` (non-nullable) → `String` в C (value type, передаётся по значению, встраивается в structs).
`string | null` → `opt_string` в C (struct: `bool has_value; String value;`). Проверка: `if (val.has_value)`.

Строковые литералы не выделяют heap:
```c
// const s = "hello"
String s = { .data = "hello", .length = 5, .capacity = 0 };  // data → rodata, malloc не вызывается
```

Heap выделяется только при динамическом построении:
```c
// const s = a + b  (конкатенация)
String s = tsc_string_concat(a, b);  // capacity > 0, data → malloc
```

При конкатенации строки с не-строковым операндом (число, bool и т.д.) компилятор материализует временный String и освобождает его после выполнения оператора:
```c
// const msg = "age: " + 42
String _tsc_cat_0 = tsc_i32_to_string(42);          // temp
String msg = tsc_string_concat(STR_LIT("age: "), _tsc_cat_0);
tsc_string_release(_tsc_cat_0);                       // cleanup после оператора
```

В контексте `return` временный String освобождается до возврата:
```c
String _tsc_cat_0 = tsc_i32_to_string(x);
String _ret_1 = tsc_string_concat(STR_LIT("val="), _tsc_cat_0);
tsc_string_release(_tsc_cat_0);
return _ret_1;
```

### Индексация и длина

```typescript
const s = "привет"   // 6 букв, 12 байт в UTF-8

s.length    // number — количество байт, O(1)
s[0]        // 208 — первый байт буквы 'п', тип u8, O(1)
s[0..2]     // string — срез по байтовым смещениям, O(1), Ref<string>
```

`s[i]` возвращает **`u8`** (байт), не `string`. Это главное отличие от JS.

Ошибка если ожидается `string`:
```
error: expected string, got u8
hint: s[i] returns a raw byte in TSC (strings are UTF-8 byte arrays).
  - s[i..i+1]  — однобайтовый срез как Ref<string>
  - for...of   — итерация по байтам (char = u8)
  - import { graphemeAt } from "std/string"  — графемный кластер по байтовому смещению
```

Срез `s[a..b]` по байтовым смещениям — O(1), `Ref<string>` (borrow). Разработчик несёт ответственность за корректность границ (как в Rust). Разрезать мультибайтовый символ — не ошибка компилятора, но runtime может выдать некорректный UTF-8.

### Символьные литералы

```typescript
const a = 'A'         // string — "A" (TS compat)
const n = '\n'        // string — "\n" (newline)
const b: u8 = 'A'     // 65 — u8, char code (явная аннотация)
const x: u8 = '\n'    // 10 — u8, escape code
const h: u8 = '\x41'  // 65 — u8, hex escape
const u: u8 = '\u0042' // 66 — u8, unicode escape
const p: u8 = 'п'     // ошибка компилятора: 'п' — мультибайтовый символ (2 байта), не u8
```

`'X'` без аннотации = `string` (как в TS, любой длины и содержимого — `'hello'`, `'привет'`, `''`). С аннотацией `: u8` / `: char` = char code — тогда ограничение: один ASCII символ или escape-последовательность; мультибайтовые и многосимвольные значения — ошибка.

### Итерация

```typescript
// for...of — итерация по байтам (char = u8)
for (const ch of "hello") {
    // ch: char — 'h', 'e', 'l', 'l', 'o'
}

// итерация по графемным кластерам — через .graphemes()
// NOTE: текущая реализация — один codepoint = один grapheme (❤️ будет два элемента)
for (const g of "привет".graphemes()) {
    // g: string — "п", "р", "и", "в", "е", "т"
}
```

### Срезы и байтовый доступ

```typescript
s.bytes        // Slice<u8> — borrow сырых байт, O(1)
s.bytes[i]     // u8 — то же что s[i]
s.bytes.clone() // u8[] — owned копия байт

s[0..4]        // Ref<string> — байтовый срез, O(1)
```

### std/string — Unicode extension methods

TSC-специфичные методы которых нет в JS/TS. Подключаются через импорт (extension methods):

```typescript
import { chars, charCount, graphemes, codePointAt, graphemeAt, sliceChars } from "std/string"

s.chars()                  // Iterator<number> — codepoints (1087, 1088...)
s.charCount()              // number — кол-во codepoints, O(n)
s.graphemes()              // Iterator<string> — графемные кластеры ("п", "❤️"...)
s.codePointAt(byteIdx)     // number — codepoint по байтовому смещению, O(1 символа)
s.graphemeAt(byteIdx)      // string — графемный кластер по байтовому смещению
s.sliceChars(start, end)   // string — срез по codepoint-индексам, O(n)
```

`codePointAt(byteIdx)` и `graphemeAt(byteIdx)` принимают **байтовое смещение** — удобно после `indexOf`: смещение уже известно, сканировать с начала не нужно.

Для сегментации графем — *[PLANNED]* **utf8proc** (UAX #29, ~300KB, C-native). Текущая реализация — упрощённая: один codepoint = один grapheme.

### Встроенные методы строк (JS-совместимые)

Импорт не нужен — доступны всегда:

```typescript
s.indexOf(sub)               // number — байтовое смещение, -1 если не найдено
s.includes(sub)              // boolean
s.startsWith(sub)            // boolean
s.endsWith(sub)              // boolean
s.slice(start, end?)         // string — копия по байтовым смещениям
s.substring(start, end?)     // string — копия
s.toUpperCase()              // string — ASCII only (Unicode: std/string)
s.toLowerCase()              // string — ASCII only
s.trim()                     // string
s.trimStart()                // string
s.trimEnd()                  // string
s.split(sep)                 // string[]
s.replace(search, replace)   // string — первое вхождение
s.replaceAll(search, replace) // string
s.padStart(len, fill?)       // string
s.padEnd(len, fill?)         // string
s.repeat(n)                  // string
s.charAt(i)                  // string — s[i..i+1] по байтовому смещению
s.charCodeAt(i)              // number — код байта по смещению (синоним s[i], расширен до uint32_t)
s.lastIndexOf(sub)           // number — байтовое смещение последнего вхождения, -1 если не найдено
s.at(i)                      // u8 | null — байт по смещению, отрицательные индексы считаются с конца
```

**`String.fromCharCode(code: number): string`** — static-метод, создаёт строку из одного codepoint:

```typescript
String.fromCharCode(65)              // "A"
String.fromCharCode(1088)            // "р" (UTF-8: 2 байта)
String.fromCharCode(0x1F600)         // "😀" (UTF-8: 4 байта)
```

Эквивалент JS `String.fromCharCode`, но принимает один codepoint (не несколько аргументов). В C генерирует `tsc_string_from_char(code)`.

Методы, требующие `import { ... } from "std/string"`:

```typescript
s.search(regex)              // number — байтовое смещение первого совпадения, -1 если не найдено
s.match(regex)               // string[] | null — все группы первого совпадения
s.matchAll(regex)            // string[][] — все совпадения (не ленивый итератор, возвращает массив сразу)
s.replaceAll(regex, replace) // string — замена всех совпадений по regex (string-вариант доступен без импорта)
```

`matchAll` возвращает `string[][]`, а не `IterableIterator` как в JS — упрощённая семантика, полный результат вычисляется сразу.

