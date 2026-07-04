#include "runtime.h"

int main(void) {
    TSC_INIT();
    d16_t a = 150;
    d16_t b = 25;
    d16_t c = tsc_mul_d16(a, b);
    return 0;
}
