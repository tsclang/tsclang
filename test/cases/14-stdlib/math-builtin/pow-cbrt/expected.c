#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(pow(2, 10)));
    printf("%g\n", (double)(cbrt(27)));
    printf("%g\n", (double)(hypot(3, 4)));
    return 0;
}
