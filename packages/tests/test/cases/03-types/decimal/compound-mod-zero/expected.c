#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t x = 15000;
    d32_t y = 0;
    d32_t _tsc_div_0 = y;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic: division by zero\n"); abort(); }
    x %= _tsc_div_0;
    return 0;
}
