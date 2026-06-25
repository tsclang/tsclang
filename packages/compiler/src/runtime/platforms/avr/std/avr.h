/* std/avr.h — AVR platform implementation (ATmega328P and compatible) */
#pragma once
#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <avr/wdt.h>
#include <util/delay.h>
#include <stdint.h>
#include <stdbool.h>
#include "avr_types.h"

/* ADC */
static inline uint16_t tsc_adc_read(uint8_t channel) {
    ADMUX  = (1<<REFS0) | (channel & 0x0F);
    ADCSRA = (1<<ADEN) | (1<<ADSC) | (1<<ADPS2) | (1<<ADPS1) | (1<<ADPS0);
    while (ADCSRA & (1<<ADSC));
    return ADC;
}

/* PWM via Timer1 (pin 9 = OC1A, pin 10 = OC1B) */
static inline void tsc_pwm_set_duty(uint8_t channel, uint8_t duty) {
    if (channel == 0) {
        TCCR1A |= (1<<COM1A1) | (1<<WGM10);
        TCCR1B |= (1<<WGM12)  | (1<<CS11);
        OCR1A   = duty;
    } else {
        TCCR1A |= (1<<COM1B1) | (1<<WGM10);
        TCCR1B |= (1<<WGM12)  | (1<<CS11);
        OCR1B   = duty;
    }
}

/* GPIO — pin 0-7 → PORTD, pin 8-13 → PORTB */
static inline void tsc_avr_pin_mode(uint8_t pin, uint8_t mode) {
    if (pin < 8) {
        if (mode) DDRD |=  (1 << pin);
        else      DDRD &= ~(1 << pin);
    } else {
        uint8_t b = pin - 8;
        if (mode) DDRB |=  (1 << b);
        else      DDRB &= ~(1 << b);
    }
}
static inline void tsc_avr_digital_write(uint8_t pin, bool val) {
    if (pin < 8) {
        if (val) PORTD |=  (1 << pin);
        else     PORTD &= ~(1 << pin);
    } else {
        uint8_t b = pin - 8;
        if (val) PORTB |=  (1 << b);
        else     PORTB &= ~(1 << b);
    }
}
static inline bool tsc_avr_digital_read(uint8_t pin) {
    if (pin < 8) return (PIND >> pin) & 1;
    return (PINB >> (pin - 8)) & 1;
}

/* Delay */
static inline void tsc_avr_delay(uint32_t ms)    { _delay_ms(ms); }
static inline void tsc_avr_delay_us(uint32_t us) { _delay_us(us); }

/* Serial (USART0) */
static inline void tsc_avr_serial_begin(uint32_t baud) {
    uint16_t ubrr = (uint16_t)(F_CPU / 16 / baud - 1);
    UBRR0H = (uint8_t)(ubrr >> 8);
    UBRR0L = (uint8_t)(ubrr);
    UCSR0B = (1<<RXEN0) | (1<<TXEN0);
    UCSR0C = (1<<UCSZ01) | (1<<UCSZ00);
}
static inline void tsc_avr_serial_write(const uint8_t *data, size_t len) {
    for (size_t i = 0; i < len; i++) {
        while (!(UCSR0A & (1<<UDRE0)));
        UDR0 = data[i];
    }
}
static inline uint8_t tsc_avr_serial_read(void) {
    while (!(UCSR0A & (1<<RXC0)));
    return UDR0;
}
static inline bool tsc_avr_serial_available(void) {
    return (UCSR0A & (1<<RXC0)) != 0;
}

/* Analog write via Timer2 (pin 3 = OC2B, pin 11 = OC2A) */
static inline void tsc_avr_analog_write(uint8_t pin, uint8_t val) {
    if (pin == 11) {
        TCCR2A |= (1<<COM2A1) | (1<<WGM21) | (1<<WGM20);
        TCCR2B |= (1<<CS21);
        OCR2A   = val;
    } else if (pin == 3) {
        TCCR2A |= (1<<COM2B1) | (1<<WGM21) | (1<<WGM20);
        TCCR2B |= (1<<CS21);
        OCR2B   = val;
    }
}

/* Interrupts */
static inline void tsc_avr_interrupt_enable(void)  { sei(); }
static inline void tsc_avr_interrupt_disable(void) { cli(); }
