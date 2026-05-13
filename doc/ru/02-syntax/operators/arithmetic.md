# Арифметические операторы

[← Вверх](./index.md) | [Следующий →](./assignment.md)

---

Операторы для числовых вычислений и конкатенации строк.

| Оператор | Описание | Пример |
|----------|----------|--------|
| `+` | Сложение / конкатенация строк | `a + b` |
| `-` | Вычитание | `a - b` |
| `*` | Умножение | `a * b` |
| `/` | Деление | `a / b` |
| `%` | Остаток от деления | `a % b` |
| `**` | Возведение в степень | `a ** b` |
| `++` | Инкремент (prefix / postfix) | `++a`, `a++` |
| `--` | Декремент (prefix / postfix) | `--a`, `a--` |

---

## Бинарные операторы

### `+` — сложение и конкатенация

Для числовых типов — обычное сложение. Для `string` — конкатенация (создаёт новую строку).

```typescript
const sum: i32 = 10 + 20;          // 30
const message: string = "Hello" + " " + "world";  // "Hello world"

// шаблонные строки предпочтительнее для сложной конкатенации:
const greeting = `Hello, ${name}!`;
```

Смешивание типов в `+` — ошибка компилятора. Используйте явную конверсию:

```typescript
const age: i32 = 25;
const msg = "Age: " + age;          // error: cannot add string and i32
const msg = `Age: ${age}`;          // ok — интерполяция
const msg = "Age: " + age.toString(); // ok — явная конверсия
```

### `-`, `*`, `/`, `%` — числовые операции

Работают только с числовыми типами. Результат имеет тип левого операнда (если типы совпадают — этот тип).

```typescript
const diff: i32 = 100 - 37;        // 63
const product: f64 = 3.14 * 2.0;   // 6.28
const quotient: i32 = 10 / 3;      // 3 (целочисленное деление)
const remainder: i32 = 10 % 3;     // 1
```

### `**` — возведение в степень

Правоассоциативный: `2 ** 3 ** 2` = `2 ** (3 ** 2)` = `2 ** 9` = `512`.

```typescript
const square: i32 = 5 ** 2;        // 25
const cube: f64 = 2.0 ** 3;        // 8.0
const nested: i32 = 2 ** 3 ** 2;   // 512 (right-associative)
```

## Унарные операторы

### Унарные `+` и `-`

Меняют знак или явно приводят к числовому типу:

```typescript
const neg: i32 = -42;              // -42
const pos: i32 = +42;              // 42
const negate: i32 = -neg;          // 42
```

### `++` и `--` — инкремент и декремент

Работают только с `let`-переменными. `const` — ошибка компилятора.

```typescript
let counter: i32 = 0;

counter++;         // counter = 1 (postfix — возвращает старое значение)
++counter;         // counter = 2 (prefix — возвращает новое значение)

const x: i32 = counter++;  // x = 2, counter = 3
const y: i32 = ++counter;  // y = 4, counter = 4
```

Постфикс и префикс в выражениях:

```typescript
let a: i32 = 5;
const b = a++;   // b = 5, a = 6 — постфикс возвращает старое значение
const c = ++a;   // c = 7, a = 7 — префикс возвращает новое значение
```

---

## C-output

```c
// const sum: i32 = 10 + 20;
int32_t sum = 10 + 20;

// const message: string = "Hello" + " " + "world";
// String concatenation → runtime function call:
String message = tsc_string_concat(
    tsc_string_concat(
        tsc_string_from_cstr("Hello"),
        tsc_string_from_cstr(" ")
    ),
    tsc_string_from_cstr("world")
);

// let counter: i32 = 0; counter++;
int32_t counter = 0;
counter++;

// const quotient: i32 = 10 / 3;
int32_t quotient = 10 / 3;
```

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot add string and i32` | Смешивание `string` и числа в `+` |
| `cannot assign to const variable` | `++` / `--` на `const` |
| `operator ** not defined for string` | Степень для нечисловых типов |

## См. также

- [Операторы присваивания](./assignment.md) — `+=`, `-=`, `*=`, `/=`, `%=`, `**=`
- [Приоритет операторов](./precedence.md) — таблица приоритетов
- [Типы данных](../../03-types/index.md) — числовые типы `i8`..`i64`, `f32`, `f64`
