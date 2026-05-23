#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", fmin(3, 5));
    printf("%g\n", fmax(3, 5));
    return 0;
}
