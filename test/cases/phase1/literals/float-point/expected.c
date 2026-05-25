#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(3.14));
    printf("%g\n", (double)(0.5));
    printf("%g\n", (double)(1.0));
    return 0;
}
