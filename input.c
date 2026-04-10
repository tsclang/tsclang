#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", sqrt(9.0));
    return 0;
}
