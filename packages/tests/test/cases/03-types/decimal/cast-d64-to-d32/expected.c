#include "runtime.h"

int main(void) {
    TSC_INIT();
    d64_t a = 150000000LL;
    d32_t b = (d32_t)(a / 10000);
    return 0;
}
