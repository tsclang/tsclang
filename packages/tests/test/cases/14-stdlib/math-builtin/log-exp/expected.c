#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(log(1))));
    printf("%s\n", tsc_dtoa((double)(log2(8))));
    printf("%s\n", tsc_dtoa((double)(log10(100))));
    printf("%s\n", tsc_dtoa((double)(exp(0))));
    return 0;
}
