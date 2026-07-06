#include "runtime.h"

typedef d32_t Money;

int main(void) {
    TSC_INIT();
    Money m = 15000;
    m += 10000;
    m = tsc_mul_d32(m, 20000);
    return 0;
}
