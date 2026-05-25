#include "runtime.h"

double getValue(void) {
    return 100;
}

int main(void) {
    TSC_INIT();
    const double x = getValue();
    printf("%g\n", (double)(x));
    return 0;
}
