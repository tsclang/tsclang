#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    a = tsc_mul_d32(a, (d32_t)(2 * 10000.0));
    return 0;
}
