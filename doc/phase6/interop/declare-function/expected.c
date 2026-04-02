#include "runtime.h"
#include <math.h>

extern double sin(double x);

int main(void) {
    TSC_INIT();
    printf("%g\n", sin(0.0));
    return 0;
}
