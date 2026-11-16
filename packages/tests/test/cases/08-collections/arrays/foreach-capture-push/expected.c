#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct { tsc_env_hdr _hdr; int32_t factor; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static void _closure_1_fn(_closure_1_env *env, int32_t x) {
    printf("%d\n", (int32_t)((uint32_t)x * (uint32_t)env->_outer->factor));
}

static _closure_1_env *_tsc_cb_env_1;
static void _closure_1_adapter(int32_t _p0) {
    _closure_1_fn(_tsc_cb_env_1, _p0);
}

void printScaled_Array_i32_i32(Array_i32 items, int32_t factor) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->factor = factor;
    tsc_env_retain(env);
    _closure_1_env *_cb_env_1 = tsc_malloc(sizeof(_closure_1_env));
    *_cb_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    _tsc_cb_env_1 = _cb_env_1;
    tsc_array_foreach_i32(items, _closure_1_adapter);
    tsc_env_release(env);
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {10, 20, 30};
    Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    printScaled_Array_i32_i32(arr, 3);
    return 0;
}
