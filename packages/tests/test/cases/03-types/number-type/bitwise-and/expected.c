#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    double y = 3.0;
    double a = (double)(((int32_t)(x)) & ((int32_t)(y)));
    double b = (double)(((int32_t)(x)) & ((int32_t)(3)));
    double c = (double)(((int32_t)(x + 1)) & ((int32_t)(y)));
    printf("%s\n", tsc_dtoa((double)(a)));
    printf("%s\n", tsc_dtoa((double)(b)));
    printf("%s\n", tsc_dtoa((double)(c)));
    return 0;
}
