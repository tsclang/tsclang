# Индексация и срезы

[← Вверх](./index.md) | [Предыдущий ←](./match/switch.md)

---

Единый синтаксис индексации и срезов для массивов `T[]` и строк `string`. Конец среза всегда **эксклюзивный** (не включается). Отрицательные индексы считают с конца.

## Сводная таблица

| Синтаксис | Массив `T[]` | Строка `string` |
|-----------|--------------|-----------------|
| `x[i]` | элемент `T` | байт `u8`, O(1) |
| `x[1..3]` | элементы 1, 2 | байты 1, 2 → `Ref<string>`, O(1) |
| `x[1..]` | с 1 до конца | байты с 1 до конца |
| `x[..3]` | с начала до 3 | байты 0, 1, 2 |
| `x[..]` | весь массив | вся строка (borrow) |
| `x[-1]` | последний элемент | последний байт `u8` |
| `x[0..-1]` | всё кроме последнего | все байты кроме последнего |
| `x[-2..]` | последние два элемента | последние два байта |

## Одиночный индекс `x[i]`

### Массив

Возвращает элемент типа `T`. Для примитивов — copy, для сложных типов — borrow (`Ref<T>`).

```typescript
const arr: i32[] = [10, 20, 30];
const first = arr[0];    // i32 — 10
const last  = arr[-1];   // i32 — 30
```

C-output:

```c
int32_t first = arr.data[0];
int32_t last  = arr.data[arr.length - 1];
```

### Строка

Возвращает **байт** типа `u8`, не `string`. Это главное отличие от JavaScript, где `"abc"[0]` даёт `"a"`.

```typescript
const s = "ABC";
const b: u8 = s[0];     // 65 — ASCII-код 'A'
const last: u8 = s[-1];  // 67 — ASCII-код 'C'
```

C-output:

```c
const uint8_t b    = (uint8_t)s.data[0];
const uint8_t last = (uint8_t)s.data[s.length - 1];
```

### Преобразование `u8` → строка

Если нужен однобайтовый символ как строка, используйте срез шириной 1:

```typescript
const s = "ABC";
const ch: Ref<string> = s[0..1];  // "A" — однобайтовый срез
```

Ошибка при попытке использовать `s[i]` там, где ожидается `string`:

```
error: expected string, got u8
hint: s[i] returns a raw byte in TSC (strings are UTF-8 byte arrays).
  - s[i..i+1]  — однобайтовый срез как Ref<string>
  - for...of   — итерация по графемным кластерам
  - import { graphemeAt } from "std/string"  — графемный кластер по байтовому смещению
```

## Срезы `x[a..b]`

### Массивы

Срез массива по умолчанию — **borrow** (`Ref<T[]>`), без копирования данных. Исходный массив остаётся жив.

```typescript
const arr = [1, 2, 3, 4, 5];

const mid  = arr[1..3];   // Ref<i32[]> — элементы 2, 3
const tail = arr[1..];    // Ref<i32[]> — элементы 2, 3, 4, 5
const init = arr[..-1];   // Ref<i32[]> — элементы 1, 2, 3, 4
const all  = arr[..];     // Ref<i32[]> — весь массив (borrow)
const last2 = arr[-2..];  // Ref<i32[]> — элементы 4, 5
```

Явная аннотация типа даёт **owned-копию** (требует `T: Clone`):

```typescript
const copy: i32[] = arr[1..3];  // i32[] — owned копия [2, 3]
```

### Строки

Строковые срезы — O(1), возвращают `Ref<string>` (borrow). Данные не копируются.

```typescript
const s = "hello world";

const sub  = s[6..];    // Ref<string> — "world"
const pref = s[..5];    // Ref<string> — "hello"
const all  = s[..];     // Ref<string> — "hello world" (borrow)
```

C-output:

```c
// s[..5]
const String pref = {.data = s.data, .length = 5, .capacity = 0};

// s[6..]
const String sub = {.data = s.data + 6, .length = s.length - 6, .capacity = 0};

// s[..]
const String all = {.data = s.data, .length = s.length, .capacity = 0};
```

`capacity = 0` означает, что строка — borrow (не владеет памятью).

## UTF-8 и строки

**Индексы указывают на байты, а не на символы.** Строка `"привет"` — 6 букв, но 12 байт в UTF-8.

```typescript
const s = "привет";  // 12 байт
s.length              // 12
s[0]                  // 208 — первый байт буквы 'п'
s[0..2]               // Ref<string> — первый байт буквы 'п' (валидный UTF-8)
```

Разработчик несёт ответственность за то, чтобы срез не разрывал мультибайтовый UTF-8 символ. Разрезать мультибайтовый символ — не ошибка компилятора, но runtime-результат будет невалидной строкой.

Для безопасных срезов по **codepoint-индексам**:

```typescript
import { sliceChars } from "std/string"

const s = "привет";
const sub = sliceChars(s, 1, 3);  // "ри" — codepoints 1..2, O(n)
```

> **Embedded:** `sliceChars` требует utf8proc (~300KB) и недоступен на платформах с `flash < 300KB`. Байтовый `slice(start, end?)` и `indexOf` доступны везде.

## Borrow и мутация

Borrow-срез блокирует мутацию источника, пока срез жив:

```typescript
let arr = [1, 2, 3, 4, 5];
const s = arr[1..3];   // Ref — arr заимствован
arr.push(6);           // ошибка: arr заимствован
```

Move из массива по индексу запрещён:

```typescript
let ref: User;
{
    const users = [user1, user2, user3];
    ref = users[0];  // ошибка: cannot move out of array by index
}
// hint: use users.remove(0) to take ownership
```

## Метод `.slice()` vs оператор `[..]`

Помимо оператора `[]`, у массивов и строк есть метод `.slice()`:

| | Оператор `[a..b]` | Метод `.slice(a, b)` |
|---|---|---|
| **Массив** | `Ref<T[]>` — borrow | `T[]` — owned копия (требует `T: Clone`) |
| **Строка** | `Ref<string>` — borrow | `string` — owned копия |

```typescript
const arr = [1, 2, 3, 4, 5];
const view = arr[1..3];        // Ref<i32[]> — borrow
const copy = arr.slice(1, 3);  // i32[] — owned копия [2, 3]

const s = "hello world";
const sv = s[..5];             // Ref<string> — borrow
const sc = s.slice(0, 5);      // string — owned копия "hello"
```

## Выход за границы

Индексация за пределами массива/строки вызывает **runtime panic** (abort). Это не undefined behavior.

```typescript
let arr: i32[] = [1, 2];

arr[0];    // ok → 1
arr[2];    // runtime error: index 2 out of bounds (length=2)
arr[-3];   // runtime error: index -3 out of bounds (length=2)
```

Компилятор не выполняет bounds check статически, кроме тривиальных случаев с константными индексами.

---

## См. также

- [Типы: массивы](../../03-types/arrays.md) — `T[]`, `T[N]`, методы массивов
- [Типы: строки](../../03-types/strings.md) — `string`, UTF-8, методы строк
- [Модель памяти](../../05-memory/index.md) — ownership, borrow checker, `Ref<T>`
- [std/string](../../10-stdlib/string.md) — `sliceChars`, `chars`, `graphemes`
