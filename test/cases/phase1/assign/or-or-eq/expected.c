#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 0;
    { int32_t _tsc_lhs = x; x = (_tsc_lhs) ? _tsc_lhs : 42; }
    printf("%d\n", x);
    return 0;
}
