#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t x = 150000;
    double clamped = (d32_t)(x < (d32_t)(0 * 10000.0) ? (d32_t)(0 * 10000.0) : (x > (d32_t)(10 * 10000.0) ? (d32_t)(10 * 10000.0) : x));
    return 0;
}
