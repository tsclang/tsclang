#include "runtime.h"

int main(void) {
    TSC_INIT();
    d8_t a = 50;
    printf("%s\n", tsc_dec_dtoa((int64_t)(a), 100, 2));
    return 0;
}
