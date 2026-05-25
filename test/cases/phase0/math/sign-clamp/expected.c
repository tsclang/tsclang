#include "runtime.h"

static double tsc_clamp(double v, double lo, double hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)((42 > 0.0) - (42 < 0.0) + 0.0));
    printf("%g\n", (double)((-42 > 0.0) - (-42 < 0.0) + 0.0));
    printf("%g\n", (double)((0 > 0.0) - (0 < 0.0) + 0.0));
    printf("%g\n", (double)(tsc_clamp(5, 0, 10)));
    printf("%g\n", (double)(tsc_clamp(-5, 0, 10)));
    printf("%g\n", (double)(tsc_clamp(15, 0, 10)));
    return 0;
}
