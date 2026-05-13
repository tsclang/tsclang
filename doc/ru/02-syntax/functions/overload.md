# Перегрузка функций

[← Вверх](./index.md) | [Следующий →](./default-params.md) | [Предыдущий ←](./arrow.md)

---

TSClang поддерживает перегрузку функций по типам параметров и по их количеству. Компилятор выбирает нужную версию на callsite, в C генерируются функции с mangled-именами.

## Перегрузка по типам

```typescript
function process(x: i32): string {
    return "int: " + x.toString();
}
function process(x: string): string {
    return "str: " + x;
}

console.log(process(42));       // "int: 42"
console.log(process("hello"));  // "str: hello"
```

**C-output:**

```c
String process_i32(int32_t x) {
    return tsc_string_concat(STR_LIT("int: "), tsc_i32_to_string(x));
}

String process_string(String x) {
    return tsc_string_concat(STR_LIT("str: "), x);
}

// callsite:
String _tmp_0 = process_i32(42);
String _tmp_1 = process_string(STR_LIT("hello"));
```

Каждая перегрузка получает уникальное C-имя по схеме name mangling: `<имя>_<тип1>_<тип2>`.

## Перегрузка по количеству параметров

```typescript
function foo(x: i32): void { console.log(x); }
function foo(x: i32, y: i32): void { console.log(x + y); }

foo(5);      // вызывает foo_i32
foo(3, 4);   // вызывает foo_i32_i32
```

**C-output:**

```c
void foo_i32(int32_t x) {
    printf("%d\n", x);
}

void foo_i32_i32(int32_t x, int32_t y) {
    printf("%d\n", x + y);
}

// callsite:
foo_i32(5);
foo_i32_i32(3, 4);
```

## Перегрузка методов класса

Работает аналогично — манглинг включает имя класса:

```typescript
class Printer {
    print(x: i32): void { /* ... */ }
    print(x: string): void { /* ... */ }
}
// → Printer_print_i32, Printer_print_string
```

## Приоритет overload resolution

Когда несколько overload подходят для вызова, компилятор выбирает по приоритету:

| Приоритет | Правило | Пример |
|-----------|---------|--------|
| 1 | Exact match (non-generic) | `foo(i32)` для вызова `foo(42)` |
| 2 | Generic с выведенным типом | `foo<T>(x: T)` для вызова `foo("hi")` |
| 3 | Implicit widening | `foo(f64)` для вызова `foo(42)` — `i32` расширяется до `f64` |

```typescript
function foo<T>(x: T): void { /* generic */ }
function foo(x: i32): void { /* non-generic */ }

foo(42);        // → foo(i32) — exact match (правило 1)
foo<i32>(42);   // → foo<i32> — явный generic, приоритет игнорируется
foo("hello");   // → foo<string> — generic (правило 2)
foo(3.14);      // → foo<f64> — только generic подходит
```

Явный generic (`foo<i32>(42)`) всегда выбирает generic overload независимо от приоритета.

## Ограничение: extern "C" запрещает перегрузку

`extern "C"` функции имеют фиксированное C-имя — манглинг невозможен. Перегрузка — ошибка компилятора:

```typescript
// ❌ ошибка: extern "C" функции не могут быть перегружены
extern "C" function process(w: any, width: i32, height: i32): void { ... }
extern "C" function process(w: any, size: i32): void { ... }

// ✅ правильно — разные имена для C
extern "C" function process_full(w: any, width: i32, height: i32): void { ... }
extern "C" function process_single(w: any, size: i32): void { ... }

// ✅ перегрузка внутри TSClang — ok
function process(w: any, width: i32, height: i32): void { process_full(w, width, height); }
function process(w: any, size: i32): void { process_single(w, size); }
```

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `ambiguous overload` | Два overload одинакового приоритета одинаково подходят для вызова |
| `extern "C" functions cannot be overloaded` | Попытка перегрузить функцию с `extern "C"` |
| `no matching overload` | Ни один overload не подходит для типов аргументов |

---

## См. также

- [Дефолтные параметры](./default-params.md) — значения по умолчанию
- [Объявление функций](./declaration.md) — базовый синтаксис
- [Модель памяти](../../05-memory/index.md) — ownership и передача аргументов
