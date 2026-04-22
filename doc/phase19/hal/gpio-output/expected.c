#include "runtime.h"
#include "std/hal.h"

int main(void) {
    TSC_INIT();
    tsc_gpio_output(13);
    return 0;
}
