## Перегрузка функций

Перегрузка по типам и по количеству параметров. Компилятор выбирает нужную версию на callsite, в C генерирует функции с mangled именами:

> **Видимость символов:** все TSClang-функции в C-output помечены `static` — не видны линковщику вне единицы компиляции. Коллизии с C-библиотеками невозможны. Только `export extern "C"` функции non-static и видны с явным C-именем — разработчик сам отвечает за уникальность имени.

```typescript
// по типам
function process(x: i32): void { ... }        // → static void process_i32(...) в C
function process(x: string): void { ... }     // → static void process_string(...) в C

process(42);       // вызывает process_i32
process("hello");  // вызывает process_string

// по количеству параметров
function foo(x: i32): void { ... }            // → static void foo_i32(...) в C
function foo(x: i32, y: i32): void { ... }    // → static void foo_i32_i32(...) в C

foo(1);     // вызывает foo_i32
foo(1, 2);  // вызывает foo_i32_i32

// комбинация
function add(a: i32, b: i32): i32 { ... }         // → static int32_t add_i32_i32(...)
function add(a: f64, b: f64): f64 { ... }         // → static double add_f64_f64(...)
function add(a: string, b: string): string { ... } // → static String add_string_string(...)
```

Перегрузка работает и для методов класса:
```typescript
class Printer {
    print(x: i32): void { ... }
    print(x: string): void { ... }
}
```

### Приоритет overload resolution

Когда несколько overload подходят для вызова, компилятор выбирает по приоритету:

1. **Exact match** — точное совпадение типов (non-generic)
2. **Generic с выведенным типом** — generic overload, тип выводится из аргументов
3. **Implicit widening** — расширение типа (например, `i32` → `f64`)

```typescript
function foo<T>(x: T): void { ... }   // generic
function foo(x: i32): void { ... }    // non-generic

foo(42)        // → foo(i32)   — exact match (правило 1), generic игнорируется
foo<i32>(42)   // → foo<i32>  — явный generic, приоритет игнорируется
foo("hello")   // → foo<string> — exact match только для generic (правило 2)
foo(3.14)      // → foo<f64>  — только generic подходит
```

Явный generic (`foo<i32>(42)`) всегда выбирает generic overload независимо от приоритета.

Если два overload одинакового приоритета одинаково подходят — ошибка компилятора (ambiguous overload).
