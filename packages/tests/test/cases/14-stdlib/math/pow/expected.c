#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(pow(2.0, 10.0))));
    return 0;
}
