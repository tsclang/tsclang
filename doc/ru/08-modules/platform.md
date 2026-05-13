# @platform — условная компиляция

[← Вверх](./index.md) | [Предыдущий ←](./callbacks.md)

---

`@platform` — декоратор для платформозависимых реализаций одной функции или класса. Компилятор включает в сборку только реализацию, соответствующую активной платформе.

## Синтаксис

```typescript
@platform("avr")
@platform("avr", "arm")   // несколько платформ
@platform("desktop")
```

## Правила

| Ситуация | Результат |
|----------|-----------|
| Функция без `@platform` | Доступна везде |
| Функция с `@platform` | Только на указанных платформах |
| Вызов на неподдерживаемой платформе | Ошибка компиляции |

## Пример: разные реализации

```typescript
@platform("avr")
function delay(ms: u16): void {
    for (let i = 0; i < ms; i++) {
        _delay_ms(1)
    }
}

@platform("arm")
function delay(ms: u32): void {
    HAL_Delay(ms)
}

@platform("desktop")
async function delay(ms: u32): Promise<void> {
    await sleep(ms)
}
```

Вызов `delay()` на платформе без соответствующей `@platform`-реализации — ошибка компиляции.

## Структура пакета с несколькими платформами

Разные реализации в разных файлах:

```
@mylib/gpio/
  index.tsc       # export { pinMode } from "./platform"
  avr.tsc         # @platform("avr") implementation
  arm.tsc         # @platform("arm") implementation
  desktop.tsc     # @platform("desktop") mock for tests
```

```typescript
// index.tsc
export { pinMode, digitalWrite } from "./platform"
```

```typescript
// avr.tsc
@platform("avr")
export function pinMode(pin: u8, mode: PinMode): void {
    native `DDR${pin} |= (1 << ${pin});`
}
```

```typescript
// desktop.tsc
@platform("desktop")
export function pinMode(pin: u8, mode: PinMode): void {
    console.log(`pinMode(${pin}, ${mode})`)
}
```

## C-output

Компилятор включает в бинарник только реализацию для активной платформы:

```typescript
// input.tsc (target: avr)
@platform("avr")
function delay(ms: u16): void {
    for (let i = 0; i < ms; i++) {
        _delay_ms(1)
    }
}

@platform("desktop")
function delay(ms: u32): void {
    sleep(ms)
}

delay(100)
```

```c
// output — только avr-реализация
void delay(uint16_t ms) {
    for (uint16_t i = 0; i < ms; i++) {
        _delay_ms(1);
    }
}

int main(void) {
    tsc_init_all();
    delay(100);
    return 0;
}
```

Desktop-реализация `delay(uint32_t)` не попала в output — платформа `avr`.

## Ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `no @platform implementation for "avr"` | Вызов функции на платформе без реализации | Добавьте `@platform("avr")` реализацию |
| `duplicate @platform("avr") for "delay"` | Две реализации для одной платформы | Удалите дубликат |
| `signature mismatch across @platform` | Разные сигнатуры у платформенных вариантов | Унифицируйте сигнатуры |

## См. также

- [native — inline C](./native.md) — платформозависимые `native` блоки
- [.d.tsc файлы](./d-tsc.md) — MMIO-регистры (embedded)
- [Конкурентность](../07-concurrency/index.md) — ISR, platform-specific async
