#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 10;
    int32_t _tsc_div_0 = 3;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic: division by zero\n"); abort(); }
    if (_tsc_div_0 == -1 && x == INT32_MIN) { fprintf(stderr, "panic: integer overflow\n"); abort(); }
    x %= _tsc_div_0;
    printf("%d\n", x);
    return 0;
}
