#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 7.0;
    double y = 3.0;
    x = (double)(((int32_t)(x)) & ((int32_t)(y)));
    printf("%g\n", (double)(x));
    double z = 15.0;
    int32_t w = 6;
    z = (double)(((int32_t)(z)) & ((int32_t)(w)));
    printf("%g\n", (double)(z));
    return 0;
}
