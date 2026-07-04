#include "runtime.h"

d32_t pick_d32(d32_t a) {
    return a;
}

int main(void) {
    TSC_INIT();
    d32_t x = (true) ? 15000 : 25000;
    return 0;
}
