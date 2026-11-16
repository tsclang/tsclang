#include "runtime.h"

static int32_t _fn_adapter_0_double_i32(void *_env, int32_t _a0);

int32_t double_i32(int32_t x) {
    return x * 2;
}

int32_t apply_fn_i32_i32_i32(tsc_closure f, int32_t x) {
    return ((int32_t (*)(void *, int32_t))f.fn)(f.env, x);
}

static int32_t _fn_adapter_0_double_i32(void *_env, int32_t _a0) {
    return double_i32(_a0);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", apply_fn_i32_i32_i32((tsc_closure){.env = NULL, .fn = (void*)_fn_adapter_0_double_i32}, 7));
    return 0;
}
