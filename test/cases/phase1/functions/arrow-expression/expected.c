#include "runtime.h"

static int32_t _lambda_0_i32(int32_t x) {
    return x * x;
}

int main(void) {
    TSC_INIT();
    tsc_closure square = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void *, int32_t))square.fn)(square.env, 5));
    return 0;
}
