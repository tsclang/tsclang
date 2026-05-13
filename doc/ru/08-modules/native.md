# native — inline C

[← Вверх](./index.md) | [Следующий →](./unsafe.md) | [Предыдущий ←](./d-tsc.md)

---

`native` — вставка C-кода verbatim в сгенерированный output. Последний resort когда `.d.tsc` недостаточно: C макросы, прямой доступ к регистрам, inline asm, platform ifdefs.

## Синтаксис

```typescript
native `<C-код>`
```

### Простая вставка

```typescript
native `PORTB |= (1 << PB5);`
```

### С интерполяцией TSClang-переменных

Компилятор подставляет C-имя переменной:

```typescript
const pin: u8 = 5
native `PORTB |= (1 << ${pin});`
```

### Многострочная вставка

```typescript
native `
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        counter++;
    }
`
```

### Inline asm

Отдельного синтаксиса для asm нет — TSClang компилирует в C, поэтому asm проходит через GCC/clang inline asm:

```typescript
native `asm volatile("nop");`
native `asm volatile("sei");`   // enable interrupts (AVR)
native `asm volatile("cli");`   // disable interrupts (AVR)
```

GCC inline asm с input/output операндами:

```typescript
const val: u8 = 0xFF
native `
    asm volatile(
        "out %0, %1"
        :
        : "I" (_SFR_IO_ADDR(PORTB)), "r" (${val})
    );
`
```

### Platform ifdef

```typescript
native `
    #ifdef __AVR__
    power_usart0_disable();
    #endif
`
```

## Как expression

`native` может возвращать значение — требует **явную аннотацию типа** (вывести из C невозможно):

```typescript
const val: i32 = native `read_register(PINB)`      // ✅
const ptr: Ref<u8[]> = native `get_buffer_ptr()`   // ✅
const val = native `read_register(PINB)`            // ❌ requires explicit type annotation
```

## Предупреждение компилятора

Компилятор и линтер выдают предупреждение на каждый `native` блок:

```
warning: native block — C code inserted verbatim, memory management is manual
```

Подавление в `tsc.package.json`:

```json
{ "allowNative": true }
```

## Ограничения

| Ограничение | Описание |
|-------------|----------|
| Явный тип для expression | `const x = native ...` — ошибка без аннотации |
| Нет type inference | Переменные C невидимы для type checker |
| Borrow checker отключён | Управление памятью ручное |
| `${expr}` — только переменные | Не произвольные выражения, только простые имена |

## Сравнение с .d.tsc

| Подход | Плюсы | Минусы |
|--------|-------|--------|
| `.d.tsc` (`declare`) | Типобезопасность, autocomplete | Только для функций/типов |
| `native` | Произвольный C, макросы, asm | Нет проверки типов |

Для всего что можно выразить через `declare function` — используйте `.d.tsc`. `native` — escape hatch.

## C-output

Код вставляется verbatim — без изменений:

```typescript
const pin: u8 = 5
native `PORTB |= (1 << ${pin});`
```

```c
uint8_t pin = 5;
PORTB |= (1 << pin);
```

Многострочная вставка — также verbatim:

```typescript
native `
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        counter++;
    }
`
```

```c
ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    counter++;
}
```

## Ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `native expression requires explicit type annotation` | `native` как expression без типа | Добавьте аннотацию: `const x: i32 = native ...` |
| `warning: native block` | Предупреждение на каждый блок | Подавите через `"allowNative": true` |
| `${expr}` не переменная | Интерполяция сложных выражений | Вынесите в переменную перед `native` |

## См. также

- [.d.tsc файлы](./d-tsc.md) — типобезопасные декларации вместо inline C
- [unsafe {}](./unsafe.md) — отключение проверок без inline C
- [Callbacks и FnPtr\<T\>](./callbacks.md) — closure bridging через `native {}`
- [@platform — условная компиляция](./platform.md) — платформозависимые `native` блоки
