#include "runtime.h"

typedef struct { bool has_value; d32_t value; } opt_d32;

int main(void) {
    TSC_INIT();
    opt_d32 opt = tsc_d32_try_parse(STR_LIT("2.7"));
    if (opt.has_value) {
        printf("%s\n", tsc_dec_dtoa((int64_t)(opt.value), 10000, 4));
    }
    return 0;
}
