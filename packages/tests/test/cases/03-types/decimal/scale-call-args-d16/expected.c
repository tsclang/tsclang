#include "runtime.h"

d16_t mul_d16_d16(d16_t a, d16_t b) {
    return tsc_mul_d16(a, b);
}

int main(void) {
    TSC_INIT();
    d16_t r = mul_d16_d16(150, 250);
    return 0;
}
