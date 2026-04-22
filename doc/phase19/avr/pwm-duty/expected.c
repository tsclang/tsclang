#include "runtime.h"
#include "std/avr.h"

int main(void) {
    TSC_INIT();
    tsc_pwm_set_duty(0, 128);
    return 0;
}
