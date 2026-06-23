#include "runtime.h"

double f(void) {
    return 5;
}

int main(void) {
    TSC_INIT();
    double x = (double)(((int32_t)(f())) & ((int32_t)(3)));
    printf("%s\n", tsc_dtoa((double)(x)));
    return 0;
}
