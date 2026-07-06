#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t x = tsc_d32_parse(STR_LIT("3.14"));
    d32_t y = tsc_d32_parse(STR_LIT("-0.5"));
    printf("%s\n", tsc_dec_dtoa((int64_t)(x), 10000, 4));
    printf("%s\n", tsc_dec_dtoa((int64_t)(y), 10000, 4));
    return 0;
}
