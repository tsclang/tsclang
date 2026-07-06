#include "runtime.h"

int main(void) {
    TSC_INIT();
    d16_t x = tsc_d16_parse(STR_LIT("12.34"));
    printf("%s\n", tsc_dec_dtoa((int64_t)(x), 100, 2));
    return 0;
}
