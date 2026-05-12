#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t _tsc_lhs_0 = 1;
    int32_t x = (_tsc_lhs_0) ? 42 : _tsc_lhs_0;
    printf("%d\n", x);
    return 0;
}
