# std/regex

[← Вверх](./index.md) | [Следующий →](./hal.md) | [Предыдущий ←](./json.md)

---

NFA-based движок регулярных выражений. Гарантированное O(n×m) время — нет catastrophic backtracking, нет ReDoS.

Доступен на всех платформах включая embedded (≈5KB скомпилированного кода, нет heap-требований).

## Импорт

```typescript
import { Regex, Match } from "std/regex"
```

## Создание

```typescript
const re = new Regex(r"\d{3}-\d{4}")   // raw string — compile-time проверка синтаксиса
const re = /\d{3}-\d{4}/              // литеральный синтаксис — эквивалентно
const rei = /hello/i                   // с флагами
```

## API

```typescript
const re = /\d{3}-\d{4}/

const m: Match | null = re.match("тел: 123-4567")

if (m != null) {
    m.value       // "123-4567" — всё совпадение
    m.start       // i32 — байтовая позиция начала
    m.end         // i32 — байтовая позиция конца
    m.group(1)    // string | null — capture group
}

re.test("123-4567")          // boolean — есть ли совпадение
re.findAll("text")           // Match[] — все совпадения
re.replace("text", "repl")  // string — первая замена
re.replaceAll("text", "r")  // string — все замены
re.split("a,b,,c")          // string[] — разбивка по паттерну
```

## Строковые методы с Regex

Строковые методы принимают `Regex` из `std/regex`:

```typescript
"123-4567".match(/\d+/)      // Match | null
"a,b,c".split(/,/)           // string[]
"hello".replace(/l+/, "r")   // string
```

## Поддерживаемый синтаксис

| Синтаксис | Поддержка |
|-----------|-----------|
| `.` `*` `+` `?` `{n}` `{n,m}` | ✅ |
| `[abc]` `[^abc]` `[a-z]` | ✅ |
| `^` `$` `\b` `\B` | ✅ |
| `\d` `\w` `\s` и инверсии `\D` `\W` `\S` | ✅ |
| `(группы)` `(?:non-capturing)` | ✅ |
| Alternation `a\|b` | ✅ |
| Named groups `(?P<name>...)` | ✅ |
| Backreferences `\1` `\2` | ❌ — используйте `@tsc/pcre` |
| Lookahead `(?=...)` `(?!...)` | ❌ — используйте `@tsc/pcre` |
| Lookbehind `(?<=...)` `(?<!...)` | ❌ — используйте `@tsc/pcre` |
| Unicode categories `\p{L}` | ❌ — используйте `@tsc/pcre` |

Несовместимые конструкции — ошибка компилятора с hint на `@tsc/pcre`:

```
error: backreferences are not supported in std/regex
  hint: use import { Regex } from "@tsc/pcre" for full PCRE syntax
```

## @tsc/pcre

Обёртка над libpcre2 для полного PCRE-синтаксиса (backreferences, lookahead, Unicode категории). API идентично `std/regex` — замена импорта:

```typescript
import { Regex } from "@tsc/pcre"   // вместо "std/regex"
// остальной код без изменений
```

⚠️ **ReDoS**: паттерны с backtracking (`(a+)+`) могут зависнуть. Не использовать с untrusted input. На embedded — ошибка компилятора (~50KB flash).

## Пример

```typescript
import { Regex } from "std/regex"

const email = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

const text = "Contact: alice@example.com and bob@test.org"
const matches = email.findAll(text)

for (const m of matches) {
    console.log(m.value)  // alice@example.com, bob@test.org
}

const phone = /(\d{3})-(\d{4})/
const m = phone.match("Call 123-4567")
if (m != null) {
    console.log(m.group(1))  // "123"
    console.log(m.group(2))  // "4567"
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `backreferences are not supported in std/regex` | Использован `\1` или `\2` |
| `lookahead is not supported in std/regex` | Использован `(?=...)` или `(?!...)` |
| `invalid regex syntax at position N` | Некорректный паттерн |
| `@tsc/pcre is not available on target "avr"` | PCRE требует heap, ~50KB flash |

## См. также

- [std/string](./string.md) — Unicode-утилиты, строковые методы с Regex
- [std/json](./json.md) — JSON-парсинг
- [Строки](../03-types/strings.md) — базовые строковые методы
