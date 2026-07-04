#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    d32_t a = 37000;
    d32_t b = (d32_t)floor((double)(a) / 10000.0) * 10000.0;
    return 0;
}
