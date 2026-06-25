#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(pow(2, 10))));
    printf("%s\n", tsc_dtoa((double)(cbrt(27))));
    printf("%s\n", tsc_dtoa((double)(hypot(3, 4))));
    return 0;
}
