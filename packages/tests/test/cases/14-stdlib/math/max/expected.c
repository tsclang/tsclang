#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(fmax(3.0, 7.0))));
    printf("%s\n", tsc_dtoa((double)(fmax(-1.0, -5.0))));
    return 0;
}
