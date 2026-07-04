#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    d32_t b = 5000;
    d32_t c = tsc_mul_d32(a, b);
    printf("%s\n", tsc_dec_dtoa((int64_t)(c), 10000, 4));
    return 0;
}
