#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(fmin(3, 5))));
    printf("%s\n", tsc_dtoa((double)(fmax(3, 5))));
    return 0;
}
