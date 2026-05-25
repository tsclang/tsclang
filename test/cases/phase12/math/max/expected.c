#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(fmax(3.0, 7.0)));
    printf("%g\n", (double)(fmax(-1.0, -5.0)));
    return 0;
}
