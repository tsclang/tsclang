#include "runtime.h"
#include "std/hal.h"

int main(void) {
    TSC_INIT();
    tsc_i2c_begin();
    return 0;
}
