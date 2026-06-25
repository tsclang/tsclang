#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    const float x = (float)(1.5);
    printf("%s\n", tsc_dtoa((double)x));
    return 0;
}
