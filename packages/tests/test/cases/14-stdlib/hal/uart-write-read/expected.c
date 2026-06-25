#include "runtime.h"
#include "std/hal.h"

int main(void) {
    TSC_INIT();
    tsc_uart_init(9600);
    tsc_uart_write(0x41);
    opt_u8 b = tsc_uart_read();
    (void)b;
    return 0;
}
