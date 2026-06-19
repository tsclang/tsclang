#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    double y = 3.0;
    double a = (double)(((int32_t)(x)) & ((int32_t)(y)));
    double b = (double)(((int32_t)(x)) & ((int32_t)(3)));
    double c = (double)(((int32_t)(x + 1)) & ((int32_t)(y)));
    printf("%g\n", (double)(a));
    printf("%g\n", (double)(b));
    printf("%g\n", (double)(c));
    return 0;
}
