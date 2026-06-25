#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(sin(0))));
    printf("%s\n", tsc_dtoa((double)(cos(0))));
    printf("%s\n", tsc_dtoa((double)(tan(0))));
    printf("%s\n", tsc_dtoa((double)(asin(0))));
    printf("%s\n", tsc_dtoa((double)(acos(1))));
    printf("%s\n", tsc_dtoa((double)(atan(0))));
    printf("%s\n", tsc_dtoa((double)(atan2(1, 1))));
    return 0;
}
