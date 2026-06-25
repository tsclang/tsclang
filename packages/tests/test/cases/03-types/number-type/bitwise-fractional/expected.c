#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 0.5;
    double a = (double)(((int32_t)(x)) & ((int32_t)(3)));
    printf("%s\n", tsc_dtoa((double)(a)));
    return 0;
}
