#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double a = 1.5;
    const float b = (float)a;
    printf("%g\n", (double)b);
    return 0;
}
