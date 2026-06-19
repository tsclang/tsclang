#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    double y = 1.0;
    double a = (double)(((int32_t)(x)) << ((int32_t)(2)));
    double b = (double)(((int32_t)(x)) << ((int32_t)(y)));
    printf("%g\n", (double)(a));
    printf("%g\n", (double)(b));
    return 0;
}
