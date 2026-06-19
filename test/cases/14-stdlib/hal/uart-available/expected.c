#include "runtime.h"
#include "std/hal.h"

int main(void) {
    TSC_INIT();
    tsc_uart_init(9600);
    const bool avail = tsc_uart_available();
    (void)avail;
    return 0;
}
