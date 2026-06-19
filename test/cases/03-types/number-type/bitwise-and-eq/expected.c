#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    x = (double)(((int32_t)(x)) & ((int32_t)(3)));
    printf("%g\n", (double)(x));
    return 0;
}
