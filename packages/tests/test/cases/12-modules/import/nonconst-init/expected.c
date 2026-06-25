#include "runtime.h"

double dep_compute(void) {
    return 42;
}

static double dep_result = 0.0;

void dep___init(void) {
    dep_result = dep_compute();
}

int main(void) {
    TSC_INIT();
    dep___init();
    printf("%s\n", tsc_dtoa((double)(dep_result)));
    return 0;
}
