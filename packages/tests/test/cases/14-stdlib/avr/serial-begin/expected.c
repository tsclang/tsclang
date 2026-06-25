#include "runtime.h"
#include "std/avr.h"

int main(void) {
    TSC_INIT();
    tsc_avr_serial_begin(9600);
    const bool avail = tsc_avr_serial_available();
    (void)avail;
    return 0;
}
