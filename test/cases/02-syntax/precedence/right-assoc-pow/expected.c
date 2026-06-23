#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(pow(2.0, pow(3.0, 2.0)))));
    return 0;
}
