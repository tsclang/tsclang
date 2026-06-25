#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(log10(1000.0))));
    return 0;
}
