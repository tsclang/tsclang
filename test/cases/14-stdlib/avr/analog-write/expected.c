#include "runtime.h"
#include "std/avr.h"

int main(void) {
    TSC_INIT();
    tsc_avr_analog_write(9, 128);
    return 0;
}
