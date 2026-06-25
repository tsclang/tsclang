#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 3.14;
    printf("%s\n", tsc_dtoa((double)(x)));
    return 0;
}
