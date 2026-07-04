#include "runtime.h"

d32_t add_d32_d32(d32_t a, d32_t b) {
    return a + b;
}

int main(void) {
    TSC_INIT();
    d32_t r = add_d32_d32(15000, 25000);
    return 0;
}
