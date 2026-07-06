#include "runtime.h"

int main(void) {
    TSC_INIT();
    d64_t x = tsc_d64_parse(STR_LIT("1.5"));
    printf("%s\n", tsc_dec_dtoa((int64_t)(x), 100000000, 8));
    return 0;
}
