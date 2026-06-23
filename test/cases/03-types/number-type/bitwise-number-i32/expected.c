#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    int32_t y = 3;
    double a = (double)(((int32_t)(x)) & ((int32_t)(y)));
    int32_t b = (double)(((int32_t)(y)) & ((int32_t)(x)));
    printf("%s\n", tsc_dtoa((double)(a)));
    printf("%d\n", b);
    return 0;
}
