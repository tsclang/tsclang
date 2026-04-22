#include "runtime.h"
#include "std/hal.h"

int main(void) {
    TSC_INIT();
    tsc_gpio_mode(3, TSC_PINMODE_OUTPUT);
    tsc_gpio_mode(4, TSC_PINMODE_INPUT);
    tsc_gpio_mode(5, TSC_PINMODE_INPUTPULLUP);
    return 0;
}
