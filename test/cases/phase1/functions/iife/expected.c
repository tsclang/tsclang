#include "runtime.h"

static int32_t _lambda_0_i32(int32_t x) {
    return x * 3;
}

int main(void) {
    TSC_INIT();
    const int32_t result = (tsc_closure){.env = NULL, .fn = (void*)_lambda_0_i32}(7);
    printf("%d\n", result);
    return 0;
}
