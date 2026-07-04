#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    printf("%s\n", tsc_dec_dtoa((int64_t)(a), 10000, 4));
    return 0;
}
