#include "runtime.h"

static const int32_t base;

static int32_t _lambda_0_i32(void *_env, int32_t x) {
    return (int32_t)((uint32_t)base + (uint32_t)x);
}

static const int32_t base = 10;

int main(void) {
    TSC_INIT();
    tsc_closure add = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void *, int32_t))add.fn)(add.env, 5));
    return 0;
}
