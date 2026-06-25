#include "runtime.h"

int32_t wrap_i32(int32_t x) {
    return x;
}

double wrap_f64(double x) {
    return x;
}

int main(void) {
    TSC_INIT();
    const int32_t a = wrap_i32(10);
    const double b = wrap_f64(20);
    printf("%s\n", tsc_dtoa((double)(a + b)));
    return 0;
}
