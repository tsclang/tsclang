#include "runtime.h"
#include "std/hal.h"

int main(void) {
    TSC_INIT();
    const uint8_t result = tsc_spi_transfer(0xAB);
    (void)result;
    return 0;
}
