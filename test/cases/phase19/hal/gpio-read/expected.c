#include "runtime.h"
#include "std/hal.h"

int main(void) {
    TSC_INIT();
    tsc_gpio_input(2);
    const bool v = tsc_gpio_read(2);
    (void)v;
    return 0;
}
