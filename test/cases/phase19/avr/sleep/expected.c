#include "runtime.h"
#include "std/avr.h"
#include <avr/sleep.h>

int main(void) {
    TSC_INIT();
    set_sleep_mode(SLEEP_MODE_IDLE);
    sleep_mode();
    return 0;
}
