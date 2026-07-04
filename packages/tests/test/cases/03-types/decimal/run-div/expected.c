#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    d32_t b = 5000;
    d32_t _tsc_div_0 = b;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic: division by zero\n"); abort(); }
    d32_t c = tsc_div_d32(a, _tsc_div_0);
    printf("%s\n", tsc_dec_dtoa((int64_t)(c), 10000, 4));
    return 0;
}
