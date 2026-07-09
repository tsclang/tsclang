#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 10;
    int32_t y = 2;
    int32_t _tsc_div_0 = y;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic[E401]: division by zero\n"); _tsc_on_panic("[E401]: division by zero"); }
    if (_tsc_div_0 == -1 && x == INT32_MIN) { fprintf(stderr, "panic[E402]: integer overflow\n"); _tsc_on_panic("[E402]: integer overflow"); }
    int32_t q = x / _tsc_div_0;
    printf("%d\n", q);
    return 0;
}
