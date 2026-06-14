#include "runtime.h"

int main(void) {
    TSC_INIT();
    double a = 1.0;
    double b = 2.0;
    double c = 3.0;
    printf("%g\n", (double)(a + b + c));
    return 0;
}