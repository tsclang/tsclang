#include "runtime.h"

static const int32_t base;

static int32_t _lambda_0_i32(void *_env, int32_t n) {
    if (n <= 0) {
        return base;
    }
    return n + _lambda_0_i32(_env, n - 1);
}

static const int32_t base = 10;

int main(void) {
    TSC_INIT();
    tsc_closure sumBase = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void *, int32_t))sumBase.fn)(sumBase.env, 5));
    return 0;
}
