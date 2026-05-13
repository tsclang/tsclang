# Операторы сравнения

[← Вверх](./index.md) | [Следующий →](./logical.md) | [Предыдущий ←](./assignment.md)

---

Операторы сравнения возвращают `bool`. В TSClang **нет неявного приведения типов** — `==` и `===` ведут себя одинаково. Рекомендуется `===` для ясности.

## Операторы

| Оператор | Описание | Результат |
|----------|----------|-----------|
| `===` | Строгое равенство | `bool` |
| `!==` | Строгое неравенство | `bool` |
| `==` | Равенство (идентично `===`) | `bool` |
| `!=` | Неравенство (идентично `!==`) | `bool` |
| `<` | Меньше | `bool` |
| `>` | Больше | `bool` |
| `<=` | Меньше или равно | `bool` |
| `>=` | Больше или равно | `bool` |

---

## `==` и `===`

В JavaScript `==` выполняет type coercion (приведение типов), а `===` — нет. В TSClang **нет type coercion вообще**, поэтому оба оператора идентичны:

```typescript
const a: i32 = 42;
const b: f64 = 42.0;

// TSClang:
a == b       // error: cannot compare i32 and f64 — different types
a === b      // error: same — нет неявного приведения

// для сравнения разных числовых типов — явная конверсия:
a == (b as i32)      // ok
i32(a) === i32(b)    // ok
```

Сравнение однотипных значений:

```typescript
const x: i32 = 42;
const y: i32 = 42;
const z: i32 = 10;

x === y     // true
x !== z     // true
x == y      // true — идентично ===
x != z      // true — идентично !==
```

---

## Сравнение с `null`

Для nullable-типов `T | null` сравнение с `null` проверяет наличие значения:

```typescript
let name: string | null = getName();

if (name !== null) {
    // name: string — type narrowing
    console.log(name.length);
}

if (name === null) {
    // name: null
    console.log("no name");
}
```

Сравнение `=== null` — основной способ сужения nullable-типов. После проверки компилятор знает точный тип в каждой ветке.

---

## Сравнение строк

Строки сравниваются по значению (посимвольно), а не по ссылке:

```typescript
const a: string = "hello";
const b: string = "hello";
const c: string = "world";

a === b     // true — одинаковое содержимое
a === c     // false
a !== c     // true
a < c       // true — лексикографическое сравнение
```

---

## Операторы порядка (`<`, `>`, `<=`, `>=`)

Работают с числовыми типами и строками (лексикографически). Строки и числа смешивать нельзя:

```typescript
const x: i32 = 10;
const y: i32 = 20;

x < y       // true
x > y       // false
x <= 10     // true
x >= 20     // false

// строки — лексикографическое сравнение
"abc" < "abd"     // true
"abc" < "ab"      // false
"abc" === "abc"   // true
```

---

## C-output

```c
// x === y (numeric)
bool result = (x == y);

// a !== null (complex type — pointer)
bool result = (a != NULL);

// name !== null (primitive — struct)
bool result = name.has_value;

// s1 < s2 (string)
bool result = (tsc_string_cmp(s1, s2) < 0);

// s1 === s2 (string)
bool result = (tsc_string_cmp(s1, s2) == 0);
```

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot compare i32 and f64` | Разные типы без явной конверсии |
| `operator < not defined for bool` | Порядок для неупорядочиваемых типов |
| `cannot compare string and i32` | Строка и число |

## См. также

- [Логические операторы](./logical.md) — `&&`, `||`, `!`
- [Truthy / Falsy](../truthy-falsy.md) — правила приведения к `bool`
- [Типы данных](../../03-types/index.md) — числовые и строковые типы
