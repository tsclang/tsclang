#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    const double x = sqrt(16.0);
    printf("%s\n", tsc_dtoa((double)(x)));
    return 0;
}
