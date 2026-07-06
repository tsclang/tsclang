#include "runtime.h"

int main(void) {
    TSC_INIT();
    d64_t a = 150000000LL;
    printf("%s\n", tsc_dec_dtoa((int64_t)(a), 100000000, 8));
    return 0;
}
