#include "runtime.h"
#include "std/avr.h"

int main(void) {
    TSC_INIT();
    const uint16_t v = tsc_adc_read(0);
    (void)v;
    return 0;
}
