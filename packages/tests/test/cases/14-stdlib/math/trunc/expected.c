#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(trunc(3.9))));
    printf("%s\n", tsc_dtoa((double)(trunc(-3.9))));
    return 0;
}
