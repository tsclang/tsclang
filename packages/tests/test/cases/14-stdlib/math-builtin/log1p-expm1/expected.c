#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(log1p(0.0))));
    printf("%s\n", tsc_dtoa((double)(expm1(0.0))));
    return 0;
}
