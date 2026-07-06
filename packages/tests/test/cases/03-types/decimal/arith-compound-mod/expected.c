#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 55000;
    d32_t _tsc_div_0 = 20000;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic: division by zero\n"); abort(); }
    a %= _tsc_div_0;
    return 0;
}
