#include "runtime.h"

static double _lambda_0_f64(void *_env, int32_t x) {
    return x + 10;
}

int32_t apply_fn_i32_i32_i32(tsc_closure f, int32_t x) {
    return ((int32_t (*)(void *, int32_t))f.fn)(f.env, x);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", apply_fn_i32_i32_i32((tsc_closure){.env = NULL, .fn = (void*)_lambda_0_f64}, 5));
    return 0;
}
