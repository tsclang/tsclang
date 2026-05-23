#include "runtime.h"

static double _lambda_0_f64(int32_t x) {
    return x * 3;
}

int main(void) {
    TSC_INIT();
    const int32_t result = _lambda_0_f64(7);
    printf("%d\n", result);
    return 0;
}
