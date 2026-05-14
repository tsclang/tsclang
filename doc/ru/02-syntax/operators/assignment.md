# Операторы присваивания

[← Вверх](./index.md) | [Следующий →](./comparison.md) | [Предыдущий ←](./arithmetic.md)

---

Все операторы присваивания в TSClang. Применимы только к `let`-переменным — попытка присвоить `const` вызовет ошибку компилятора.

## Базовое присваивание

```typescript
let x: i32 = 10;
x = 20;              // простое присваивание
```

Для сложных типов (массивы, объекты, классы) присваивание — **move**. После `a = b` переменная `b` невалидна:

```typescript
let a = new Node();
let b = a;              // move — a теперь невалидна
// console.log(a);      // error: use of moved variable
```

**Исключение: `string`** использует ARC, а не move. После `let b = a` обе переменные валидны:

```typescript
let a: string = "hello";
let b: string = a;      // copy + retain — обе валидны
console.log(a.length);  // ok
console.log(b.length);  // ok
```

---

## Составные операторы

### Арифметические

| Оператор | Эквивалент | Описание |
|----------|------------|----------|
| `+=` | `a = a + b` | Сложение / конкатенация с присваиванием |
| `-=` | `a = a - b` | Вычитание с присваиванием |
| `*=` | `a = a * b` | Умножение с присваиванием |
| `/=` | `a = a / b` | Деление с присваиванием |
| `%=` | `a = a % b` | Остаток с присваиванием |
| `**=` | `a = a ** b` | Степень с присваиванием |

```typescript
let total: i32 = 100;
total += 50;         // 150
total -= 30;         // 120
total *= 2;          // 240
total /= 4;          // 60
total %= 7;          // 4
total **= 3;         // 64

// string += — конкатенация
let msg: string = "Hello";
msg += " world";     // "Hello world"
```

### Битовые

| Оператор | Эквивалент | Описание |
|----------|------------|----------|
| `&=` | `a = a & b` | Побитовое И с присваиванием |
| `\|=` | `a = a \| b` | Побитовое ИЛИ с присваиванием |
| `^=` | `a = a ^ b` | Побитовое XOR с присваиванием |
| `<<=` | `a = a << b` | Сдвиг влево с присваиванием |
| `>>=` | `a = a >> b` | Сдвиг вправо (знаковый) с присваиванием |
| `>>>=` | `a = a >>> b` | Сдвиг вправо (беззнаковый) с присваиванием |

```typescript
let flags: u32 = 0xFF;
flags &= 0x0F;       // 0x0F — сбросить верхние биты
flags |= 0x80;       // 0x8F — установить бит 7
flags ^= 0x01;       // 0x8E — инвертировать бит 0
flags <<= 4;         // 0x8E0 — сдвиг влево на 4
flags >>= 2;         // 0x238 — сдвиг вправо на 2 (знаковый)
```

### Логические

| Оператор | Эквивалент | Описание |
|----------|------------|----------|
| `&&=` | `a = a && b` | Логическое И с присваиванием |
| `\|\|=` | `a = a \|\| b` | Логическое ИЛИ с присваиванием |
| `??=` | `a = a ?? b` | Nullish coalescing с присваиванием |

```typescript
// ||=
let name: string = "";
name ||= "Anonymous";   // "Anonymous" — "" falsy

// &&=
let config: string | null = "debug";
config &&= config.toUpperCase();  // "DEBUG"

// ??=
let port: i32 | null = null;
port ??= 8080;          // 8080 — null, присваивается дефолт
```

`??=` присваивает значение только если левый операнд `null` (не `0`, не `""`, не `false`):

```typescript
let count: i32 | null = 0;
count ??= 99;           // count = 0 — 0 это не null, присваивание не происходит

let label: string | null = "";
label ??= "default";    // label = "" — пустая строка это не null
```

---

## C-output

```c
// let total: i32 = 100; total += 50;
int32_t total = 100;
total += 50;

// flags &= 0x0F;
flags &= 0x0F;

// port ??= 8080;
if (!port.has_value) {
    port.has_value = true;
    port.value = 8080;
}

// let msg: string = "Hello"; msg += " world";
String msg = tsc_string_from_cstr("Hello");
String _tmp = tsc_string_concat(msg, tsc_string_from_cstr(" world"));
tsc_string_drop(&msg);
msg = _tmp;
```

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot assign to const variable` | Присваивание в `const` |
| `use of moved variable` | Использование переменной после move-присваивания |
| `cannot mix \|\| and ?? without parentheses` | `\|\|=` / `&&=` / `??=` в одном выражении без скобок |

## См. также

- [Арифметические операторы](./arithmetic.md) — `+`, `-`, `*`, `/`, `%`, `**`
- [Битовые операторы](./bitwise.md) — `&`, `|`, `^`, `<<`, `>>`, `>>>`
- [Логические операторы](./logical.md) — `&&`, `||`, `??`
- [Модель памяти](../../05-memory/index.md) — ownership и семантика move
