#include "runtime.h"
#include "std/avr.h"

int main(void) {
    TSC_INIT();
    tsc_avr_interrupt_enable();
    tsc_avr_interrupt_disable();
    return 0;
}
