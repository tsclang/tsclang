#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    double a = 1.50005;
    d32_t b = (d32_t)llround(a * 10000.0);
    printf("%s\n", tsc_dec_dtoa((int64_t)(b), 10000, 4));
    return 0;
}
