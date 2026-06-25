#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(floor(2.7))));
    printf("%s\n", tsc_dtoa((double)(ceil(2.1))));
    printf("%s\n", tsc_dtoa((double)(round(2.5))));
    printf("%s\n", tsc_dtoa((double)(round(2.4))));
    printf("%s\n", tsc_dtoa((double)(trunc(2.9))));
    printf("%s\n", tsc_dtoa((double)(trunc(-2.9))));
    return 0;
}
