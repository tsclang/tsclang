#include "runtime.h"

typedef d32_t Money;

int main(void) {
    TSC_INIT();
    Money m = 15000;
    Money price = 20000;
    Money sum = m + price;
    Money product = tsc_mul_d32(m, price);
    return 0;
}
