#include "runtime.h"

double getValue(void) {
    return 100;
}

int main(void) {
    TSC_INIT();
    const double x = getValue();
    printf("%s\n", tsc_dtoa((double)(x)));
    return 0;
}
