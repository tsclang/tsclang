#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", fabs(-5));
    return 0;
}
