#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 7.0;
    double y = 3.0;
    double a = (double)(((int32_t)(x + 1)) & ((int32_t)(y + 1)));
    double b = (double)(((int32_t)(x * 2)) | ((int32_t)(y)));
    double c = (double)(((int32_t)(x + 1)) & ((int32_t)(y - 1)));
    double d = (double)(((int32_t)(x - 3)) ^ ((int32_t)(y + 2)));
    printf("%g\n", (double)(a));
    printf("%g\n", (double)(b));
    printf("%g\n", (double)(c));
    printf("%g\n", (double)(d));
    return 0;
}
