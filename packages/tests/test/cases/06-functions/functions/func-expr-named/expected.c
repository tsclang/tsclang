#include "runtime.h"

static int32_t _lambda_0_i32(void *_env, int32_t x) {
    return x * 2;
}

int main(void) {
    TSC_INIT();
    tsc_closure twice = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void *, int32_t))twice.fn)(twice.env, 21));
    return 0;
}
