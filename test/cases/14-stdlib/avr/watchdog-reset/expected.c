#include "runtime.h"
#include "std/avr.h"
#include <avr/wdt.h>

int main(void) {
    TSC_INIT();
    wdt_reset();
    return 0;
}
