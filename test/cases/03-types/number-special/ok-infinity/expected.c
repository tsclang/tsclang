#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double x = INFINITY;
    printf("%g\n", (double)(x));
    return 0;
}
