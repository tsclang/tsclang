#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(round(3.6))));
    printf("%s\n", tsc_dtoa((double)(round(3.4))));
    return 0;
}
