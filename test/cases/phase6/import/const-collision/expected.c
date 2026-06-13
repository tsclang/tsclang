#include "runtime.h"

static const double a_MAX = 100.0;

static const double b_MAX = 200.0;

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(a_MAX));
    printf("%g\n", (double)(b_MAX));
    return 0;
}
