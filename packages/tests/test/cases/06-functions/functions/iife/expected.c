#include "runtime.h"

static double _lambda_0_f64(void *_env, int32_t x) {
    return x * 3;
}

int main(void) {
    TSC_INIT();
    const int32_t result = _lambda_0_f64(((void *)0), 7);
    printf("%d\n", result);
    return 0;
}
