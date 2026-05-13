# Строки

[← Вверх](./index.md) | [Следующий →](./special-types.md) | [Предыдущий ←](./numbers.md)

---

Тип `string` в TSClang — это **UTF-8 байтовая последовательность**. Ключевое отличие от JS: индексация и `length` работают с **байтами**, не с символами.

## C-layout

```c
typedef struct {
    const char* data;      // указатель на байты: rodata (литералы) или heap (динамические)
    size_t      length;    // количество байт
    size_t      capacity;  // 0 = статическая строка (rodata, не освобождать)
                           // > 0 = heap (malloc, освобождать при drop)
} String;
```

- `string` (non-nullable) → `String` в C (value type, встраивается в structs)
- `string | null` → `String*` в C (указатель, `NULL` = null)

## Строковые литералы — без heap

Литералы не выделяют heap: `capacity = 0`, `data` указывает на rodata-секцию:

```typescript
const s = "hello"
```

```c
String s = { .data = "hello", .length = 5, .capacity = 0 };  // rodata, malloc не вызывается
```

Heap выделяется только при динамическом построении (конкатенация, `toString()`, форматирование):

```typescript
const s = a + b   // tsc_str_concat(a, b) — capacity > 0, malloc
```

## Индексация и длина

```typescript
const s = "привет"   // 6 букв, 12 байт в UTF-8

s.length    // 12 — количество байт, O(1)
s[0]        // 208 — первый байт буквы 'п', тип u8, O(1)
s[0..2]     // Ref<string> — срез по байтовым смещениям, O(1)
```

**`s[i]` возвращает `u8`** (байт), не `string`. Это главное отличие от JS.

```
error: expected string, got u8
hint: s[i] returns a raw byte in TSC (strings are UTF-8 byte arrays).
  - s[i..i+1]  — однобайтовый срез как Ref<string>
  - for...of   — итерация по графемным кластерам
  - import { graphemeAt } from "std/string"
```

Срез `s[a..b]` — по **байтовым смещениям**, O(1), `Ref<string>` (borrow). Разрезать мультибайтовый символ — не ошибка компилятора, но runtime может выдать некорректный UTF-8.

## Символьные литералы

```typescript
const a: u8 = 'A'    // 65 — тип u8, как в C
const n: u8 = '\n'   // 10
const p: u8 = 'п'    // ошибка: 'п' — мультибайтовый (2 байта), не u8
```

`'X'` — литерал типа `u8`. Только ASCII и escape-последовательности.

## Итерация: for-of

`for...of` итерирует **графемные кластеры** (UAX #29):

```typescript
for (const ch of "привет❤️") {
    // ch: string — "п", "р", "и", "в", "е", "т", "❤️"
}
```

## Срезы и байтовый доступ

```typescript
s.bytes          // Slice<u8> — borrow сырых байт, O(1)
s.bytes[i]       // u8 — то же что s[i]
s.bytes.clone()  // u8[] — owned копия байт

s[0..4]          // Ref<string> — байтовый срез, O(1)
```

## Встроенные методы (JS-совместимые)

Импорт не нужен — доступны всегда:

| Метод | Возвращаемый тип | Описание |
|-------|-----------------|----------|
| `s.indexOf(sub)` | `i32` | Байтовое смещение, -1 если не найдено |
| `s.includes(sub)` | `boolean` | Содержит подстроку |
| `s.startsWith(sub)` | `boolean` | Начинается с |
| `s.endsWith(sub)` | `boolean` | Заканчивается на |
| `s.slice(start, end?)` | `string` | Копия по байтовым смещениям |
| `s.substring(start, end?)` | `string` | Копия |
| `s.toUpperCase()` | `string` | ASCII only |
| `s.toLowerCase()` | `string` | ASCII only |
| `s.trim()` | `string` | Удалить пробелы с обоих концов |
| `s.trimStart()` | `string` | Удалить пробелы в начале |
| `s.trimEnd()` | `string` | Удалить пробелы в конце |
| `s.split(sep)` | `string[]` | Разделить по разделителю |
| `s.replace(search, repl)` | `string` | Заменить первое вхождение (string) |
| `s.replaceAll(search, repl)` | `string` | Заменить все вхождения (string) |
| `s.padStart(len, fill?)` | `string` | Дополнить в начале |
| `s.padEnd(len, fill?)` | `string` | Дополнить в конце |
| `s.repeat(n)` | `string` | Повторить n раз |
| `s.charAt(i)` | `string` | `s[i..i+1]` по байтовому смещению |
| `s.charCodeAt(i)` | `u8` | Байт по смещению (синоним `s[i]`) |
| `s.lastIndexOf(sub)` | `i32` | Байтовое смещение последнего вхождения |
| `s.at(i)` | `u8 \| null` | Байт по смещению, отрицательные от конца |

```typescript
const s = "Hello, World!"
s.indexOf("World")       // 7
s.includes("Hello")      // true
s.slice(0, 5)            // "Hello"
s.toUpperCase()          // "HELLO, WORLD!"
s.trim()                 // "Hello, World!"
s.split(", ")            // ["Hello", "World!"]
s.replace("World", "TSC")  // "Hello, TSC!"
s.repeat(3)              // "Hello, World!Hello, World!Hello, World!"
s.at(-1)                 // 33 (byte for '!')
```

## Методы с regex (требуют import)

```typescript
import { search, match, matchAll, replaceAll } from "std/string"

s.search(regex)               // i32 — байтовое смещение первого совпадения
s.match(regex)                // string[] | null — группы первого совпадения
s.matchAll(regex)             // string[][] — все совпадения (массив, не ленивый итератор)
s.replaceAll(regex, replace)  // string — замена всех совпадений по regex
```

`matchAll` возвращает `string[][]`, не `IterableIterator` как в JS — полный результат вычисляется сразу.

## std/string — Unicode extension methods

TSC-специфичные методы, которых нет в JS/TS. Подключаются через явный импорт:

```typescript
import { chars, charCount, graphemes, codePointAt, graphemeAt, sliceChars } from "std/string"

s.chars()                  // Iterator<u32> — codepoints (1087, 1088...)
s.charCount()              // i32 — количество codepoints, O(n)
s.graphemes()              // Iterator<string> — графемные кластеры
s.codePointAt(byteIdx)     // u32 — codepoint по байтовому смещению
s.graphemeAt(byteIdx)      // string — графемный кластер по байтовому смещению
s.sliceChars(start, end)   // string — срез по codepoint-индексам, O(n)
```

`codePointAt(byteIdx)` и `graphemeAt(byteIdx)` принимают **байтовое смещение** — удобно после `indexOf`: смещение уже известно.

### Доступность на платформах

| Метод | Без utf8proc | С utf8proc |
|-------|-------------|------------|
| `chars`, `charCount`, `codePointAt` | ✅ | ✅ |
| `indexOf`, `slice` (байтовый) | ✅ | ✅ |
| `graphemes`, `graphemeAt`, `sliceChars` | ❌ | ✅ |

Графемная сегментация требует **utf8proc** (~300KB, C-native). На embedded-платформах с `flash < 300KB` импорт `graphemes`, `graphemeAt`, `sliceChars` — **ошибка компилятора**.

## C-output

### Литерал

```typescript
const s = "hello"
```

```c
String s = { .data = "hello", .length = 5, .capacity = 0 };
```

### Конкатенация

```typescript
const greeting = "Hello, " + name + "!"
```

```c
String _tmp1 = tsc_str_concat(STR_LIT("Hello, "), name);
String greeting = tsc_str_concat(_tmp1, STR_LIT("!"));
tsc_str_free(&_tmp1);
```

### for-of итерация

```typescript
for (const ch of text) {
    console.log(ch)
}
```

```c
GraphemeIter _it = graphemes_iter(text);
while (true) {
    String ch = graphemes_next(&_it);
    if (ch.data == NULL) break;
    tsc_console_log(ch);
}
```

### Встроенные методы

```typescript
const pos = s.indexOf("needle")
const upper = s.toUpperCase()
```

```c
int32_t pos = tsc_str_indexof(s, STR_LIT("needle"));
String upper = tsc_str_toUpper(s);
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `expected string, got u8` | `s[i]` возвращает байт, не строку. Используйте `s[i..i+1]` или `charAt(i)` |
| `'п' is a multi-byte character, not u8` | Символьный литерал содержит non-ASCII |
| `utf8proc not available on embedded (flash < 300KB)` | `graphemes`/`graphemeAt`/`sliceChars` на платформе без utf8proc |
| `empty object literal is forbidden` | Для динамических ключей используйте `Map<string, string>` |

## См. также

- [Числовые типы](./numbers.md) — конвертация число ↔ строка, `.toString()`, `parseInt`
- [Массивы](./arrays.md) — `string[]`, `split()`, `join()`
- [Null](./null.md) — `string | null`, optional chaining `s?.length`
- [Модель памяти](../05-memory/index.md) — `string` как heap owner, `Ref<string>`, move-семантика
- [std/string](../10-stdlib/string.md) — Unicode-методы, regex, кодирования
