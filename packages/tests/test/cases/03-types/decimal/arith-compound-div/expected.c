#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    d32_t _tsc_div_0 = (d32_t)(3 * 10000.0);
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic[E401]: division by zero\n"); abort(); }
    a = tsc_div_d32(a, _tsc_div_0);
    return 0;
}
