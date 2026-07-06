#include "runtime.h"

int main(void) {
    TSC_INIT();
    d8_t a = 50;
    d8_t b = 100;
    d8_t c = tsc_mul_d8(a, b);
    return 0;
}
