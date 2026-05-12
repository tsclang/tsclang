#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    const double x = sqrt(16.0);
    printf("%g\n", x);
    return 0;
}
