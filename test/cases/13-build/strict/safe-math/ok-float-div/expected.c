#include "runtime.h"

int main(void) {
    TSC_INIT();
    double a = 10.0;
    double b = 2.0;
    double q = a / b;
    printf("%s\n", tsc_dtoa((double)(q)));
    return 0;
}
