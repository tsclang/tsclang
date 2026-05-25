#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)((-5.0 > 0.0) - (-5.0 < 0.0) + 0.0));
    printf("%g\n", (double)((0.0 > 0.0) - (0.0 < 0.0) + 0.0));
    printf("%g\n", (double)((3.0 > 0.0) - (3.0 < 0.0) + 0.0));
    return 0;
}
