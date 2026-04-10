#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", log1p(0.0));
    printf("%g\n", expm1(0.0));
    return 0;
}
