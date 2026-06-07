#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    double y = 3.0;
    double a = (double)(((int32_t)(x)) & ((int32_t)(y)));
    printf("%g\n", (double)(a));
    return 0;
}
