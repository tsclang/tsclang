#include "runtime.h"
#include <math.h>

extern double fabs(double x);

extern double floor(double x);

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(fabs(-3.5))));
    printf("%s\n", tsc_dtoa((double)(floor(2.9))));
    return 0;
}
