#include "runtime.h"

static int32_t _fn_adapter_0_double_i32(void *_env, int32_t _a0);

int32_t double_i32(int32_t x) {
    return x * 2;
}

static int32_t _fn_adapter_0_double_i32(void *_env, int32_t _a0) {
    return double_i32(_a0);
}

int main(void) {
    TSC_INIT();
    tsc_closure fn = (tsc_closure){.env = NULL, .fn = (void*)_fn_adapter_0_double_i32};
    printf("%d\n", ((int32_t (*)(void *, int32_t))fn.fn)(fn.env, 5));
    return 0;
}
