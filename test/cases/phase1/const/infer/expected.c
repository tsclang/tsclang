#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double x = 100.0;
    printf("%g\n", x);
    return 0;
}
