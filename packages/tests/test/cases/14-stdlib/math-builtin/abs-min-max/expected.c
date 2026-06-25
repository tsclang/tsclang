#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(fabs(-5))));
    printf("%s\n", tsc_dtoa((double)(fabs(3.14))));
    printf("%s\n", tsc_dtoa((double)(fmin(1, 2))));
    printf("%s\n", tsc_dtoa((double)(fmax(1, 2))));
    return 0;
}
