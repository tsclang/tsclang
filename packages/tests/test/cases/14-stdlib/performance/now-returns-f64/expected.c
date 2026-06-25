#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double t = tsc_performance_now();
    printf("%s\n", (t >= 0.0) ? "true" : "false");
    return 0;
}
