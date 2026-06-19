#include "runtime.h"
#include "std/avr.h"

int main(void) {
    TSC_INIT();
    tsc_avr_pin_mode(13, 1);
    tsc_avr_digital_write(13, true);
    const bool v = tsc_avr_digital_read(13);
    (void)v;
    return 0;
}
