#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    d32_t a = 20000;
    d32_t b = 30000;
    d32_t c = (d32_t)pow((double)(a) / 10000.0, (double)(b) / 10000.0) * 10000.0;
    return 0;
}
