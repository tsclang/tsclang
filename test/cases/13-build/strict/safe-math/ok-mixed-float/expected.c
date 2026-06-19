#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 42;
    double b = 3.14;
    double c = a + b;
    printf("%g\n", (double)(c));
    return 0;
}
