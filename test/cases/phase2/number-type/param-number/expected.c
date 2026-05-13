#include "runtime.h"

double add_f64_f64(double a, double b) {
    return a + b;
}

int main(void) {
    TSC_INIT();
    const double x = 1.5;
    const double y = 2.5;
    printf("%g\n", add_f64_f64(x, y));
    return 0;
}
