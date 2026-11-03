#include "runtime.h"

int main(void) {
    TSC_INIT();
    double u01d4b3 = 3.0;
    printf("%s\n", tsc_dtoa((double)(u01d4b3)));
    return 0;
}
