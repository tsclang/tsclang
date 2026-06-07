#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    double a = (double)(((int32_t)(x)) & ((int32_t)(3)));
    double b = (double)(((int32_t)(x)) | ((int32_t)(8)));
    double c = (double)(((int32_t)(x)) ^ ((int32_t)(1)));
    double d = (double)(((int32_t)(x)) << ((int32_t)(1)));
    double e = (double)(((int32_t)(x)) >> ((int32_t)(1)));
    printf("%g\n", (double)(a));
    printf("%g\n", (double)(b));
    printf("%g\n", (double)(c));
    printf("%g\n", (double)(d));
    printf("%g\n", (double)(e));
    return 0;
}
