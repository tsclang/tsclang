#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", M_PI);
    printf("%g\n", M_E);
    return 0;
}
