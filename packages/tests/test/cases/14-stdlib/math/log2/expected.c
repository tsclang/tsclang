#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(log2(8.0))));
    return 0;
}
