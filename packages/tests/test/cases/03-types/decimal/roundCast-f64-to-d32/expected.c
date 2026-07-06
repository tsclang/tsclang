#include "runtime.h"

int main(void) {
    TSC_INIT();
    double a = 1.5;
    d32_t b = (d32_t)(a * 10000.0);
    return 0;
}
