#include "runtime.h"

d32_t half(void) {
    return 15000;
}

int main(void) {
    TSC_INIT();
    d32_t x = half();
    printf("%s\n", tsc_dec_dtoa((int64_t)(x), 10000, 4));
    return 0;
}
