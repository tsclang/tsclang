#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 3.0;
    x = (double)(((int32_t)(x)) < ((int32_t)(2)));
    printf("%s\n", tsc_dtoa((double)(x)));
    return 0;
}
