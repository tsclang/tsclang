#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 12345;
    d32_t b = 10003;
    d32_t c = tsc_mul_d32(a, b);
    return 0;
}
