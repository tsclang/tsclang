#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(3.14)));
    printf("%s\n", tsc_dtoa((double)(0.5)));
    printf("%s\n", tsc_dtoa((double)(1.0)));
    return 0;
}
