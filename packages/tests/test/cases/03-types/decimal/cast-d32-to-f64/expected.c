#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t d = 15000;
    double f = (double)(d / 10000.0);
    return 0;
}
