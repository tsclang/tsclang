#include "runtime.h"

static int32_t _lambda_0_i32(int32_t x) {
    return x + 10;
}

int32_t apply_fn_i32_i32_i32(tsc_closure f, int32_t x) {
    return ((int32_t (*)(int32_t))f.fn)(x);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", apply_fn_i32_i32_i32((tsc_closure){.env = NULL, .fn = (void*)_lambda_0_i32}, 5));
    return 0;
}
