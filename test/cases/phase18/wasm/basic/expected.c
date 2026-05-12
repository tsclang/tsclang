#include "runtime.h"

int32_t add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}

double mul_f64_f64(double a, double b) {
    return a * b;
}

int main(void) {
    TSC_INIT();
    return 0;
}
