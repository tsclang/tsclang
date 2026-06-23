#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    double a = (double)(~((int32_t)(x)));
    printf("%s\n", tsc_dtoa((double)(a)));
    return 0;
}
