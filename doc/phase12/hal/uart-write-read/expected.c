#include "runtime.h"
#include "std/hal.h"

typedef struct { bool has_value; uint8_t value; } opt_u8;

int main(void) {
    TSC_INIT();
    tsc_uart_init(9600);
    tsc_uart_write(0x41);
    const opt_u8 b = tsc_uart_read();
    (void)b;
    return 0;
}
