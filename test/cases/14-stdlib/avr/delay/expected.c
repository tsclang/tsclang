#include "runtime.h"
#include "std/avr.h"

int main(void) {
    TSC_INIT();
    tsc_avr_delay(100);
    tsc_avr_delay_us(500);
    return 0;
}
