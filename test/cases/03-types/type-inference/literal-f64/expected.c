#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double x = 3.14;
    printf("%g\n", (double)(x));
    return 0;
}
