#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)((-5.0 > 0.0) - (-5.0 < 0.0) + 0.0)));
    printf("%s\n", tsc_dtoa((double)((0.0 > 0.0) - (0.0 < 0.0) + 0.0)));
    printf("%s\n", tsc_dtoa((double)((3.0 > 0.0) - (3.0 < 0.0) + 0.0)));
    return 0;
}
