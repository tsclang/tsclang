#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

static int32_t _fn_adapter_0_square_i32(void *_env, int32_t _a0);

int32_t square_i32(int32_t x) {
    return (int32_t)((uint32_t)x * (uint32_t)x);
}

static int32_t _fn_adapter_0_square_i32(void *_env, int32_t _a0) {
    return square_i32(_a0);
}

int main(void) {
    TSC_INIT();
    tsc_closure _fns_lit[] = {(tsc_closure){.env = NULL, .fn = (void*)_fn_adapter_0_square_i32}};
    const Array_tsc_closure fns = {.data = _fns_lit, .length = 1, .capacity = 1};
    printf("%d\n", ((int32_t (*)(void *, int32_t))fns.data[0].fn)(fns.data[0].env, 4));
    for (size_t _ci = 0; _ci < fns.length; _ci++) tsc_env_release(fns.data[_ci].env);
    return 0;
}
