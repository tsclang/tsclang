#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = -35000;
    d32_t b = (d32_t)abs(a);
    printf("%s\n", tsc_dec_dtoa((int64_t)(b), 10000, 4));
    return 0;
}
