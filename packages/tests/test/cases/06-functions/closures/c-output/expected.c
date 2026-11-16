#include "runtime.h"

static const int32_t factor;

static int32_t _lambda_0_i32(void *_env, int32_t x) {
    return (int32_t)((uint32_t)factor * (uint32_t)x);
}

static const int32_t factor = 3;

int main(void) {
    TSC_INIT();
    tsc_closure mul = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void *, int32_t))mul.fn)(mul.env, 7));
    return 0;
}
