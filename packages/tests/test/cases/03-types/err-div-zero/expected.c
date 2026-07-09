#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 10;
    int32_t _tsc_div_0 = 0;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic[E401]: division by zero\n"); abort(); }
    if (_tsc_div_0 == -1 && x == INT32_MIN) { fprintf(stderr, "panic[E402]: integer overflow\n"); abort(); }
    int32_t y = x / _tsc_div_0;
    return 0;
}
