#include "runtime.h"

int main(void) {
    TSC_INIT();
    d16_t w = 50;
    d32_t d = (d32_t)(w * 100);
    printf("%s\n", tsc_dec_dtoa((int64_t)(d), 10000, 4));
    return 0;
}
