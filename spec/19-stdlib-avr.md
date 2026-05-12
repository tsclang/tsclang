# TSClang — std/avr: реализация

> Детальная спецификация реализации `std/avr` (AVR-специфичный API).
> Реализовано (desktop stubs + AVR platform profile spec).

## Назначение

`std/avr` — низкоуровневый API для AVR-микроконтроллеров (ATmega328P и совместимые).
Только `#[target(avr)]` — ошибка компилятора на desktop/arm/esp32.
Дополняет `std/hal` прямым доступом к периферии (delay, serial, ADC, PWM, interrupts).

## Зависимости

- `<avr/io.h>` — регистры I/O
- `<avr/interrupt.h>` — `sei()`, `cli()`
- `<avr/sleep.h>` — `set_sleep_mode()`, `sleep_mode()`
- `<avr/wdt.h>` — `wdt_reset()`
- `<util/delay.h>` — `_delay_ms()`, `_delay_us()`

## Типы

```c
typedef enum {
    TSC_SLEEP_IDLE        = 0,   // SLEEP_MODE_IDLE
    TSC_SLEEP_ADC         = 1,   // SLEEP_MODE_ADC
    TSC_SLEEP_PWR_DOWN    = 2,   // SLEEP_MODE_PWR_DOWN
    TSC_SLEEP_PWR_SAVE    = 3,   // SLEEP_MODE_PWR_SAVE
    TSC_SLEEP_STANDBY     = 4,   // SLEEP_MODE_STANDBY
    TSC_SLEEP_EXT_STANDBY = 5    // SLEEP_MODE_EXT_STANDBY
} TscSleepMode;
```

## Функции

| TSClang | C-функция | AVR-регистры | Статус |
|---------|-----------|-------------|--------|
| `ADC.read(ch)` | `tsc_adc_read(ch)` | `ADMUX`, `ADCSRA`, `ADC` | ✓ |
| `PWM.setDuty(ch, duty)` | `tsc_pwm_set_duty(ch, duty)` | `OCR0A`/`OCR1A`/… | ✓ |
| `avr.sleep(mode)` | `set_sleep_mode(mode); sleep_mode()` | `SMCR` | ✓ |
| `avr.watchdogReset()` | `wdt_reset()` | WDT | ✓ |
| `analogRead(pin)` | `tsc_adc_read(pin)` | = ADC.read | ✓ |
| `pinMode(pin, mode)` | `tsc_avr_pin_mode(pin, mode)` | `DDRx` | ✓ |
| `digitalWrite(pin, val)` | `tsc_avr_digital_write(pin, val)` | `PORTx` | ✓ |
| `digitalRead(pin)` | `tsc_avr_digital_read(pin)` | `PINx` | ✓ |
| `delay(ms)` | `tsc_avr_delay(ms)` | `_delay_ms` | ✓ |
| `delayMicroseconds(us)` | `tsc_avr_delay_us(us)` | `_delay_us` | ✓ |
| `serialBegin(baud)` | `tsc_avr_serial_begin(baud)` | `UBRR0H/L`, `UCSR0B` | ✓ |
| `serialWrite(data)` | `tsc_avr_serial_write(data.data, data.length)` | `UDR0` | ✓ |
| `serialRead()` | `tsc_avr_serial_read()` | `UDR0` | ✓ |
| `serialAvailable()` | `tsc_avr_serial_available()` | `UCSR0A` | ✓ |
| `analogWrite(pin, val)` | `tsc_avr_analog_write(pin, val)` | `OCRxA`/`OCRxB` | ✓ |
| `interruptEnable()` | `tsc_avr_interrupt_enable()` | `sei()` | ✓ |
| `interruptDisable()` | `tsc_avr_interrupt_disable()` | `cli()` | ✓ |

## Реализация (шаг 3 — только AVR target)

```c
// GPIO через lookup table: pin 0-7 → DDRD/PORTD/PIND, pin 8-13 → DDRB/PORTB/PINB
void tsc_avr_pin_mode(uint8_t pin, uint8_t mode) {
    if (pin < 8) { if (mode) DDRD |= (1<<pin); else DDRD &= ~(1<<pin); }
    else         { if (mode) DDRB |= (1<<(pin-8)); else DDRB &= ~(1<<(pin-8)); }
}

// Serial: ATmega328P USART0
void tsc_avr_serial_begin(uint32_t baud) {
    uint16_t ubrr = F_CPU / 16 / baud - 1;
    UBRR0H = (ubrr >> 8);
    UBRR0L = ubrr;
    UCSR0B = (1<<RXEN0) | (1<<TXEN0);
    UCSR0C = (1<<UCSZ01) | (1<<UCSZ00);   // 8-bit, 1 stop, no parity
}

void tsc_avr_serial_write(const uint8_t *data, size_t len) {
    for (size_t i = 0; i < len; i++) {
        while (!(UCSR0A & (1<<UDRE0)));    // wait TX ready
        UDR0 = data[i];
    }
}

uint8_t tsc_avr_serial_read(void) {
    while (!(UCSR0A & (1<<RXC0)));         // wait RX ready
    return UDR0;
}

bool tsc_avr_serial_available(void) {
    return (UCSR0A & (1<<RXC0)) != 0;
}

// delay: compile-time constant требуется для _delay_ms
void tsc_avr_delay(uint32_t ms)    { _delay_ms(ms); }
void tsc_avr_delay_us(uint32_t us) { _delay_us(us); }

// analogWrite через Timer PWM (OCR)
void tsc_avr_analog_write(uint8_t pin, uint8_t val) {
    // pin 9 → OC1A, pin 10 → OC1B, pin 3 → OC2B, pin 11 → OC2A
    // настройка TCCR + запись OCRxA/B
}

void tsc_avr_interrupt_enable(void)  { sei(); }
void tsc_avr_interrupt_disable(void) { cli(); }
```

### Стаб для desktop (уже готово)

В `src/runtime/std/avr.h` все функции — no-op stubs, компилируются gcc.
Реальная реализация выбирается через `cmake/toolchain-avr.cmake` при `#[target(avr)]`.

## Тесты

| Тест | Файл | Статус |
|------|------|--------|
| sleep | `test/cases/phase19/avr/sleep` | ✓ проходит |
| watchdog-reset | `test/cases/phase19/avr/watchdog-reset` | ✓ проходит |
| adc-read | `test/cases/phase19/avr/adc-read` | ✓ проходит |
| pwm-duty | `test/cases/phase19/avr/pwm-duty` | ✓ проходит |
| gpio-digital | `test/cases/phase19/avr/gpio-digital` | ✓ проходит |
| serial-begin | `test/cases/phase19/avr/serial-begin` | ✓ проходит |
| delay | `test/cases/phase19/avr/delay` | ✓ проходит |
| interrupts | `test/cases/phase19/avr/interrupts` | ✓ проходит |
| analog-write | `test/cases/phase19/avr/analog-write` | ✓ проходит |
