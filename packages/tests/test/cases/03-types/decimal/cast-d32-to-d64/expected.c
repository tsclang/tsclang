#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t d = 25000;
    d64_t big = (d64_t)(d * 10000LL);
    return 0;
}
