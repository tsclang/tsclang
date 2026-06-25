#include "runtime.h"
#include <float.h>

int main(void) {
    TSC_INIT();
    const double nan = NAN;
    const double posInf = INFINITY;
    const double negInf = (-INFINITY);
    const double eps = DBL_EPSILON;
    printf("%s\n", tsc_dtoa((double)(nan)));
    printf("%s\n", tsc_dtoa((double)(posInf)));
    printf("%s\n", tsc_dtoa((double)(negInf)));
    return 0;
}
