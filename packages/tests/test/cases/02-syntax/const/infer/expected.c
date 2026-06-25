#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double x = 100.0;
    printf("%s\n", tsc_dtoa((double)(x)));
    return 0;
}
