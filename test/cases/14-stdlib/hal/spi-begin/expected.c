#include "runtime.h"
#include "std/hal.h"

int main(void) {
    TSC_INIT();
    tsc_spi_begin();
    return 0;
}
