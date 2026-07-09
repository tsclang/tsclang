#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    d32_t b = 5000;
    d32_t _tsc_div_0 = b;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic[E401]: division by zero\n"); abort(); }
    d32_t c = a % _tsc_div_0;
    return 0;
}
