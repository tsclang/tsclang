#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double t1 = tsc_performance_now();
    const double t2 = tsc_performance_now();
    printf("%s\n", (t2 >= t1) ? "true" : "false");
    return 0;
}
