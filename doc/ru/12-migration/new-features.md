# Новые возможности TSClang

[← Вверх](./index.md) | [Предыдущий ←](./incompatible.md)

---

TSClang добавляет возможности, которых нет в TypeScript. Они обусловлены требованиями системного программирования: управление памятью, предсказуемое поведение, встраиваемые платформы.

## Ownership-система

TSClang использует Rust-подобную ownership-модель вместо garbage collector. Каждый тип может использоваться в одной из четырёх форм:

| Форма | Обозначение | Семантика |
|-------|-------------|-----------|
| Owned | `T` | Единственный владелец, освобождает при выходе из scope |
| Immutable borrow | `Ref<T>` | Заимствование только для чтения |
| Mutable borrow | `Mut<T>` | Заимствование для чтения и записи |
| Shared ownership | `Shared<T>` | Подсчёт ссылок, освобождение при последнем drop |

```typescript
function process(data: string): void {
    const len = data.length     // borrow — не перемещает
    consume(data)               // move — data больше недоступна
    // console.log(data)        // ошибка: use after move
}
```

Подробнее — в разделе [Модель памяти](../05-memory/index.md).

## throws — явное объявление ошибок

В отличие от TypeScript, где любая функция может `throw` что угодно, TSClang требует явного объявления типов ошибок в сигнатуре:

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Компилятор проверяет, что `throw` и оператор `?` используются только в функциях с `throws`.

### C-output

```c
typedef struct {
    bool ok;
    union {
        String value;
        struct {
            _readFile_err_kind _kind;
            union { IOError io; } _err;
        };
    };
} _Result_String_IOError;
```

Подробнее — в разделе [Обработка ошибок](../06-errors/index.md).

## `mut` методы

Методы, изменяющие `this`, должны быть помечены `mut`:

```typescript
class Counter {
    private count: i32 = 0

    increment(): void mut { this.count++ }     // изменяет this
    get(): i32 { return this.count }            // только чтение
}
```

Это позволяет компилятору отслеживать заимствования на уровне методов. Вызов `mut`-метода на `Ref<T>` — ошибка компиляции.

## match — pattern matching

Полноценный pattern matching, которого нет в TypeScript:

```typescript
match (value) {
    0               => console.log("zero"),
    n if n < 10     => console.log(`small: ${n}`),
    _               => console.log("big"),
}

// Деструктуризация в match:
match (result) {
    Ok(value)   => process(value),
    Err(e)      => console.log(e.message),
}

// Match по типу в union:
match (shape) {
    Circle { radius }    => Math.PI * radius * radius,
    Rect { w, h }        => w * h,
}
```

Подробнее — в разделе [Синтаксис: Match](../02-syntax/match/syntax.md).

## Оператор `?` — propagate errors

Сокращение для `return on error`, аналогичное Rust:

```typescript
function process(): string throws IOError {
    const content = readFile("data.txt")?    // если IOError — вернуть из функции
    return content.trim()
}
```

### C-output

```c
_Result_String_IOError _r = readFile(str("data.txt"));
if (!_r.ok) return (_Result_String_IOError){ .ok = false, ._err = _r._err };
String content = _r.value;
```

## Фиксированные массивы `T[N]`

Массивы фиксированного размера на стеке — нет heap-allocation:

```typescript
const buf: u8[256] = [0]     // 256 байт на стеке
const matrix: f64[3][3] = [[0]]  // 2D-массив
```

### C-output

```c
uint8_t buf[256] = {0};
double matrix[3][3] = {{0}};
```

## `as` — wrap/truncation (не UB)

Приведение типов через `as` всегда определено — wrap или truncation, никогда undefined behavior:

```typescript
const x: u8 = 300 as u8    // 44 (wrap around)
const y: i32 = 3.14 as i32 // 3   (truncation)
```

### C-output

```c
uint8_t x = (uint8_t)300;     // defined wrap
int32_t y = (int32_t)3.14;    // defined truncation
```

## Platform profiles

Условная компиляция без препроцессора — для desktop и embedded:

```typescript
// @if desktop
function getEnv(): string { return process.env.HOME }

// @if embedded
function getEnv(): string { return "/flash" }
```

Компилятор выбирает реализацию на основе целевой платформы. Подробнее — в разделе [Модули: Platform](../08-modules/platform.md).

## Extension methods

Добавление методов к чужим типам без наследования:

```typescript
extension string {
    isDigit(): bool { return this >= "0" && this <= "9" }
}

const check = "5".isDigit()   // true
```

## `@embedded.*` аннотации

Для встраиваемых платформ — ISR, inline, no-heap:

```typescript
@embedded.isr("TIMER0_COMPA")
onTimer(): void {
    counter++
}

@embedded.inline
fastPath(x: i32): i32 { return x * 2 }

@embedded.noHeap
function baremetal(): void {   // запрещает heap-allocation в теле
    const buf: u8[64] = [0]    // только стек
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `throw in non-throws function` | `throw` или `?` без `throws` в сигнатуре |
| `cannot call mut method on Ref<T>` | Попытка изменить через immutable borrow |
| `non-exhaustive match` | Не все варианты покрыты в `match` |
| `use after move` | Обращение к переменной после передачи ownership |
| `heap allocation in @noHeap function` | `new` или heap-операция в no-heap контексте |

## См. также

- [Модель памяти](../05-memory/index.md) — ownership, borrow checker, Ref/Mut/Shared
- [Обработка ошибок](../06-errors/index.md) — throws, Result, операторы `?` и `!`
- [Синтаксис: Match](../02-syntax/match/syntax.md) — pattern matching
- [Модули: Platform](../08-modules/platform.md) — условная компиляция
- [Классы: Декораторы](../04-classes/decorators.md) — `@embedded.*` и другие аннотации
