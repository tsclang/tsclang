#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 1.0;
    double y = 2.0;
    printf("%s\n", tsc_dtoa((double)(x + y)));
    return 0;
}
