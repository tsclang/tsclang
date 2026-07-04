#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    d32_t a = 90000;
    d32_t b = (d32_t)sqrt((double)(a) / 10000.0) * 10000.0;
    printf("%s\n", tsc_dec_dtoa((int64_t)(b), 10000, 4));
    return 0;
}
