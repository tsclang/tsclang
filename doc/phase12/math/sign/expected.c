#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (-5.0 > 0.0) - (-5.0 < 0.0) + 0.0);
    printf("%g\n", (0.0 > 0.0) - (0.0 < 0.0) + 0.0);
    printf("%g\n", (3.0 > 0.0) - (3.0 < 0.0) + 0.0);
    return 0;
}
