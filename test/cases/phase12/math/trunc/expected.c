#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", trunc(3.9));
    printf("%g\n", trunc(-3.9));
    return 0;
}
