#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(pow(2.0, 10.0)));
    return 0;
}
