#include "runtime.h"

static int32_t _fn_adapter_0_increment_i32(void *_env, int32_t _a0);
static int32_t _fn_adapter_1_decrement_i32(void *_env, int32_t _a0);

int32_t increment_i32(int32_t x) {
    return x + 1;
}

int32_t decrement_i32(int32_t x) {
    return x - 1;
}

tsc_closure getOp_bool(bool inc) {
    if (inc) {
        return (tsc_closure){.env = NULL, .fn = (void*)_fn_adapter_0_increment_i32};
    }
    return (tsc_closure){.env = NULL, .fn = (void*)_fn_adapter_1_decrement_i32};
}

static int32_t _fn_adapter_0_increment_i32(void *_env, int32_t _a0) {
    return increment_i32(_a0);
}

static int32_t _fn_adapter_1_decrement_i32(void *_env, int32_t _a0) {
    return decrement_i32(_a0);
}

int main(void) {
    TSC_INIT();
    tsc_closure op = getOp_bool(true);
    printf("%d\n", ((int32_t (*)(void *, int32_t))op.fn)(op.env, 10));
    tsc_env_release(op.env);
    return 0;
}
