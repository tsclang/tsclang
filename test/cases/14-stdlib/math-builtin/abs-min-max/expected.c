#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(fabs(-5)));
    printf("%g\n", (double)(fabs(3.14)));
    printf("%g\n", (double)(fmin(1, 2)));
    printf("%g\n", (double)(fmax(1, 2)));
    return 0;
}
