#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(fmin(3, 5)));
    printf("%g\n", (double)(fmax(3, 5)));
    return 0;
}
