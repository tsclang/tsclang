#include "runtime.h"

int main(void) {
    TSC_INIT();
    d8_t x = tsc_d8_parse(STR_LIT("0.5"));
    printf("%s\n", tsc_dec_dtoa((int64_t)(x), 100, 2));
    return 0;
}
