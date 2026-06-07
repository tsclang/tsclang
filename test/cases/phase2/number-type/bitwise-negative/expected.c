#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = -1;
    double a = (double)(((int32_t)(x)) & ((int32_t)(0xFF)));
    printf("%g\n", (double)(a));
    return 0;
}
