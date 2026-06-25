#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 10;
    int32_t b = 2;
    int32_t _tsc_div_0 = b;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic: division by zero\n"); abort(); }
    if (_tsc_div_0 == -1 && a == INT32_MIN) { fprintf(stderr, "panic: integer overflow\n"); abort(); }
    int32_t q = a / _tsc_div_0;
    return 0;
}
