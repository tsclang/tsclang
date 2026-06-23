#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double x = NAN;
    printf("%g\n", (double)(x));
    return 0;
}
