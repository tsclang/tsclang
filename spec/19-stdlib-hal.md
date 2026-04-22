# TSClang — std/hal: реализация

> Детальная спецификация реализации `std/hal` (Hardware Abstraction Layer).
> Шаг 3 в плане: документация → тесты → реализация.

## Назначение

`std/hal` — переносимый API для работы с железом: GPIO, I2C, SPI, UART.
Работает на embedded-таргетах (avr, arm, esp32) через platform profile,
и на desktop как mock (no-op) для unit-тестирования без железа.

## Зависимости

- Embedded: реализуется через `declare module "std/hal"` в platform profile
- Desktop: mock-стаб (no-op) — `src/runtime/std/hal.h`
- Таргет `avr`: директива `#[target(avr)]` обязательна

## Типы

```c
typedef enum {
    TSC_PINMODE_INPUT       = 0,
    TSC_PINMODE_OUTPUT      = 1,
    TSC_PINMODE_INPUTPULLUP = 2
} TscPinMode;
```

## Функции

| TSClang | C-функция | Тип возврата | Статус |
|---------|-----------|-------------|--------|
| `GPIO.mode(pin, mode)` | `tsc_gpio_mode(pin, mode)` | `void` | NEW |
| `GPIO.output(pin)` | `tsc_gpio_output(pin)` | `void` | уже есть |
| `GPIO.input(pin)` | `tsc_gpio_input(pin)` | `void` | уже есть |
| `GPIO.read(pin)` | `tsc_gpio_read(pin)` | `bool` | уже есть |
| `GPIO.write(pin, val)` | `tsc_gpio_write(pin, val)` | `void` | уже есть |
| `I2C.begin()` | `tsc_i2c_begin()` | `void` | NEW |
| `I2C.write(addr, data)` | `tsc_i2c_write(addr, data.data, data.length)` | `void` | уже есть |
| `I2C.read(addr, n)` | `tsc_i2c_read(addr, n)` | `Array_u8` | уже есть (macro) |
| `SPI.begin()` | `tsc_spi_begin()` | `void` | NEW |
| `SPI.transfer(byte)` | `tsc_spi_transfer(byte)` | `uint8_t` | уже есть |
| `UART.init(opts)` | `tsc_uart_init(baud)` | `void` | уже есть |
| `UART.write(byte)` | `tsc_uart_write(byte)` | `void` | уже есть |
| `UART.read()` | `tsc_uart_read()` | `opt_u8` | уже есть |
| `UART.available()` | `tsc_uart_available()` | `bool` | NEW |

`GPIO.output(pin)` = `GPIO.mode(pin, PinMode.OUTPUT)` — синоним.
`GPIO.input(pin)` = `GPIO.mode(pin, PinMode.INPUT)` — синоним.

## Platform profile mapping (AVR)

```typescript
// @avr/platform/index.d.tsc
declare module "std/hal" {
    enum PinMode { INPUT = 0, OUTPUT = 1, INPUTPULLUP = 2 }

    namespace GPIO {
        function mode(pin: u8, mode: PinMode): void   // DDRx |= (1 << pin)
        function write(pin: u8, val: bool): void       // PORTx
        function read(pin: u8): bool                   // PINx
    }
    namespace I2C {
        function begin(): void                         // TWBR + TWSR init
        function write(addr: u8, data: u8[]): void     // TWI protocol
        function read(addr: u8, n: u32): u8[]          // TWI read
    }
    namespace SPI {
        function begin(): void                         // SPCR = (1<<SPE)|(1<<MSTR)|(1<<SPR0)
        function transfer(byte: u8): u8                // SPDR exchange
    }
    namespace UART {
        function init(opts: { baud: u32 }): void       // UBRR0H/L + UCSR0B
        function write(byte: u8): void                  // UDR0
        function read(): opt_u8                         // UDR0 (если RXC0)
        function available(): bool                      // UCSR0A & RXC0
    }
}
```

## Реализация (шаг 3)

### Desktop mock (уже готово)
Все функции — no-op в `src/runtime/std/hal.h`. Компилируется и линкуется без железа.

### AVR platform profile (шаг 3)
Реализация через регистры AVR:
- `tsc_gpio_mode(pin, OUTPUT)`: `DDRx |= (1 << bit)`, lookup table pin → port/bit
- `tsc_gpio_write(pin, val)`: `PORTx |= (1 << bit)` / `PORTx &= ~(1 << bit)`
- `tsc_gpio_read(pin)`: `(PINx >> bit) & 1`
- `tsc_i2c_begin()`: `TWBR = ((F_CPU/100000)-16)/2; TWSR = 0`
- `tsc_spi_begin()`: `SPCR = (1<<SPE)|(1<<MSTR)|(1<<SPR0)`
- `tsc_uart_available()`: `(UCSR0A & (1<<RXC0)) != 0`

## Тесты

| Тест | Файл | Статус |
|------|------|--------|
| gpio-output | `doc/phase19/hal/gpio-output` | ✓ проходит |
| gpio-write | `doc/phase19/hal/gpio-write` | ✓ проходит |
| gpio-read | `doc/phase19/hal/gpio-read` | ✓ проходит |
| uart-init | `doc/phase19/hal/uart-init` | ✓ проходит |
| uart-write-read | `doc/phase19/hal/uart-write-read` | ✓ проходит |
| spi-transfer | `doc/phase19/hal/spi-transfer` | ✓ проходит |
| i2c-write-read | `doc/phase19/hal/i2c-write-read` | ✓ проходит |
| gpio-pinmode | `doc/phase19/hal/gpio-pinmode` | ✗ ждёт шага 3 |
| uart-available | `doc/phase19/hal/uart-available` | ✗ ждёт шага 3 |
| i2c-begin | `doc/phase19/hal/i2c-begin` | ✗ ждёт шага 3 |
| spi-begin | `doc/phase19/hal/spi-begin` | ✗ ждёт шага 3 |
| err-hal-desktop | `doc/phase19/hal/err-hal-desktop` | ✓ проходит |
