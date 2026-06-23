#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double x = -INFINITY;
    printf("%s\n", tsc_dtoa((double)(x)));
    return 0;
}
