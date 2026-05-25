#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(log1p(0.0)));
    printf("%g\n", (double)(expm1(0.0)));
    return 0;
}
