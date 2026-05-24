#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", pow(2, 10));
    printf("%g\n", cbrt(27));
    printf("%g\n", hypot(3, 4));
    return 0;
}
