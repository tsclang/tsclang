#include "runtime.h"

int main(void) {
    TSC_INIT();
    double a = 1.5;
    double b = 2.5;
    double q = a + b;
    printf("%g\n", (double)(q));
    return 0;
}
