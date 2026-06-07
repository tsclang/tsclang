#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    double mask = 3.0;
    double a = (double)(((int32_t)((x > 0) ? x : 0)) & ((int32_t)(mask)));
    printf("%g\n", (double)(a));
    return 0;
}
