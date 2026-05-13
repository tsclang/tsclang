# std/string

[← Вверх](./index.md) | [Следующий →](./json.md) | [Предыдущий ←](./ws.md)

---

Unicode-утилиты, кодирование и форматирование для строк. Импортируются явно.

## Импорт

```typescript
import { chars, charCount, graphemes, codePointAt, graphemeAt, sliceChars } from "std/string"
import { base64, hex, url } from "std/string"
import { format } from "std/string"
```

## Unicode extension methods

Методы для работы с Unicode. Принимают байтовые смещения — удобно после `indexOf`.

```typescript
const s = "привет❤️"

s.chars()                  // Iterator<u32> — codepoints, O(1) per step
s.charCount()              // i32 — количество codepoints, O(n)
s.graphemes()              // Iterator<string> — графемные кластеры ("п", "р", "❤️")
s.codePointAt(byteIdx)     // u32 — codepoint по байтовому смещению
s.graphemeAt(byteIdx)      // string — графемный кластер по байтовому смещению
s.sliceChars(start, end)   // string — безопасный срез по codepoint-индексам, O(n)
```

### Паттерн: найти подстроку → получить символ

```typescript
const idx = s.indexOf("❤️")        // байтовое смещение, O(n)
if (idx >= 0) {
    const g = s.graphemeAt(idx)    // "❤️", O(1 символа)
}
```

### Ограничения на embedded

Графемные методы (`graphemes`, `graphemeAt`, `sliceChars`) требуют utf8proc (~300KB). На платформах с `flash < 300KB` — ошибка компилятора.

Методы без utf8proc (доступны везде): `chars()`, `charCount()`, `codePointAt()`, `indexOf()`, байтовый `slice()`.

## Кодирование

### base64

```typescript
base64.encode(bytes: u8[]): string
base64.decode(s: string): u8[] throws ParseError
```

### hex

```typescript
hex.encode(bytes: u8[]): string     // "deadbeef"
hex.decode(s: string): u8[] throws ParseError
```

### URL

```typescript
url.encode(s: string): string       // "hello%20world"
url.decode(s: string): string throws ParseError
url.encodeComponent(s: string): string
url.decodeComponent(s: string): string throws ParseError
```

## Форматирование

```typescript
format("Hello %s, you are %d years old", name, age)   // string
format("Pi is %.2f", Math.PI)                          // "Pi is 3.14"
format("%05d", 42)                                     // "00042"
```

### Спецификаторы

| Спецификатор | Описание |
|-------------|----------|
| `%s` | string |
| `%d` | целое число |
| `%f` | float (`%.Nf` — N знаков после запятой) |
| `%x` | hex (нижний регистр) |
| `%X` | hex (верхний регистр) |
| `%b` | binary |
| `%o` | octal |
| `%%` | литеральный `%` |

## Пример

```typescript
import { chars, charCount, graphemes, base64, hex, format } from "std/string"

const s = "Hello, мир!"

console.log(charCount(s))                        // 11 codepoints
for (const cp of chars(s)) { console.log(cp) }   // каждый codepoint

const encoded = base64.encode([0xDE, 0xAD, 0xBE, 0xEF])  // "3q2+7w=="
const hexstr = hex.encode([0xDE, 0xAD])                   // "dead"

const msg = format("User %s, score: %05d", "Alice", 42)   // "User Alice, score: 00042"
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `grapheme methods require utf8proc (~300KB)` | Недостаточно flash для utf8proc на embedded |
| `ParseError: invalid base64` | Невалидная base64-строка |
| `ParseError: invalid hex` | Невалидная hex-строка |

## См. также

- [std/json](./json.md) — JSON-парсинг
- [std/regex](./regex.md) — регулярные выражения
- [Строки](../03-types/strings.md) — строковый тип, литералы, базовые методы
