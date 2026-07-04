#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t i = 5;
    d32_t d = (d32_t)(i * 10000);
    printf("%s\n", tsc_dec_dtoa((int64_t)(d), 10000, 4));
    return 0;
}
