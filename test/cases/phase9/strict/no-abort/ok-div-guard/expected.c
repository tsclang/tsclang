#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 10;
    int32_t y = 2;
    int32_t _tsc_div_0 = y;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic: division by zero\n"); _tsc_on_panic("division by zero"); }
    int32_t q = x / _tsc_div_0;
    printf("%d\n", q);
    return 0;
}
