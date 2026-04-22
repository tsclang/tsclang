/* std/hal.h — AVR platform implementation (ATmega328P and compatible) */
#pragma once
#include <avr/io.h>
#include <util/twi.h>
#include <stdint.h>
#include <stdbool.h>
#include "hal_types.h"

/* GPIO — pin 0-7 → PORTD, pin 8-13 → PORTB */
static inline void tsc_gpio_mode(uint8_t pin, TscPinMode mode) {
    if (pin < 8) {
        if (mode != TSC_PINMODE_INPUT) DDRD |=  (1 << pin);
        else                           DDRD &= ~(1 << pin);
        if (mode == TSC_PINMODE_INPUTPULLUP) PORTD |= (1 << pin);
    } else {
        uint8_t b = pin - 8;
        if (mode != TSC_PINMODE_INPUT) DDRB |=  (1 << b);
        else                           DDRB &= ~(1 << b);
        if (mode == TSC_PINMODE_INPUTPULLUP) PORTB |= (1 << b);
    }
}
static inline void tsc_gpio_output(uint8_t pin) { tsc_gpio_mode(pin, TSC_PINMODE_OUTPUT); }
static inline void tsc_gpio_input(uint8_t pin)  { tsc_gpio_mode(pin, TSC_PINMODE_INPUT); }

static inline void tsc_gpio_write(uint8_t pin, bool val) {
    if (pin < 8) {
        if (val) PORTD |=  (1 << pin);
        else     PORTD &= ~(1 << pin);
    } else {
        uint8_t b = pin - 8;
        if (val) PORTB |=  (1 << b);
        else     PORTB &= ~(1 << b);
    }
}
static inline bool tsc_gpio_read(uint8_t pin) {
    if (pin < 8) return (PIND >> pin) & 1;
    return (PINB >> (pin - 8)) & 1;
}

/* I2C (TWI) */
static inline void tsc_i2c_begin(void) {
    TWBR = (uint8_t)((F_CPU / 100000UL - 16) / 2);
    TWSR = 0;
}
static inline void _tsc_twi_start(void) {
    TWCR = (1<<TWINT) | (1<<TWSTA) | (1<<TWEN);
    while (!(TWCR & (1<<TWINT)));
}
static inline void _tsc_twi_stop(void) {
    TWCR = (1<<TWINT) | (1<<TWSTO) | (1<<TWEN);
}
static inline void _tsc_twi_write_byte(uint8_t byte) {
    TWDR = byte;
    TWCR = (1<<TWINT) | (1<<TWEN);
    while (!(TWCR & (1<<TWINT)));
}
static inline void tsc_i2c_write(uint8_t addr, const uint8_t *buf, size_t len) {
    _tsc_twi_start();
    _tsc_twi_write_byte((addr << 1) | TW_WRITE);
    for (size_t i = 0; i < len; i++) _tsc_twi_write_byte(buf[i]);
    _tsc_twi_stop();
}
/* tsc_i2c_read — macro with GCC statement-expression; caller provides Array_u8 context */
#define tsc_i2c_read(_addr, _n) ({ \
    _tsc_twi_start(); \
    _tsc_twi_write_byte(((_addr) << 1) | TW_READ); \
    size_t _rn = (_n); \
    uint8_t *_rbuf = (uint8_t *)malloc(_rn); \
    for (size_t _ri = 0; _ri < _rn; _ri++) { \
        TWCR = (1<<TWINT) | (1<<TWEN) | (_ri < _rn - 1 ? (1<<TWEA) : 0); \
        while (!(TWCR & (1<<TWINT))); \
        _rbuf[_ri] = TWDR; \
    } \
    _tsc_twi_stop(); \
    (Array_u8){ .data = _rbuf, .length = _rn, .capacity = _rn }; \
})

/* SPI */
static inline void tsc_spi_begin(void) {
    DDRB |= (1<<DDB3) | (1<<DDB5) | (1<<DDB2); /* MOSI, SCK, SS as output */
    SPCR  = (1<<SPE) | (1<<MSTR) | (1<<SPR0);
}
static inline uint8_t tsc_spi_transfer(uint8_t byte) {
    SPDR = byte;
    while (!(SPSR & (1<<SPIF)));
    return SPDR;
}

/* UART (USART0 on ATmega328P) */
static inline void tsc_uart_init(uint32_t baud) {
    uint16_t ubrr = (uint16_t)(F_CPU / 16 / baud - 1);
    UBRR0H = (uint8_t)(ubrr >> 8);
    UBRR0L = (uint8_t)(ubrr);
    UCSR0B = (1<<RXEN0) | (1<<TXEN0);
    UCSR0C = (1<<UCSZ01) | (1<<UCSZ00);
}
static inline void tsc_uart_write(uint8_t byte) {
    while (!(UCSR0A & (1<<UDRE0)));
    UDR0 = byte;
}
static inline bool tsc_uart_available(void) {
    return (UCSR0A & (1<<RXC0)) != 0;
}
typedef struct { bool has_value; uint8_t value; } opt_u8;
static inline opt_u8 tsc_uart_read(void) {
    if (!(UCSR0A & (1<<RXC0))) return (opt_u8){ false, 0 };
    return (opt_u8){ true, UDR0 };
}
