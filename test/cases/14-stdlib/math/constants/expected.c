#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(M_PI)));
    printf("%s\n", tsc_dtoa((double)(M_E)));
    return 0;
}
