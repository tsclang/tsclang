#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    const double x = sqrt(16.0);
    printf("%g\n", (double)(x));
    return 0;
}
