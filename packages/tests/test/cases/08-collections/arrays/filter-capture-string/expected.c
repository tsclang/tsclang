#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct { tsc_env_hdr _hdr; int32_t threshold; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static bool _closure_1_fn(_closure_1_env *env, int32_t x) {
    return x > env->_outer->threshold;
}

static _closure_1_env *_tsc_cb_env_1;
static bool _closure_1_adapter(int32_t _p0) {
    return _closure_1_fn(_tsc_cb_env_1, _p0);
}

Array_i32 filterAbove_Array_i32_i32(Array_i32 items, int32_t threshold) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->threshold = threshold;
    tsc_env_retain(env);
    _closure_1_env *_cb_env_1 = tsc_malloc(sizeof(_closure_1_env));
    *_cb_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    _tsc_cb_env_1 = _cb_env_1;
    Array_i32 _ret_0 = tsc_array_filter_i32(items, _closure_1_adapter);
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_1[] = {1, 5, 3, 8, 2};
    Array_i32 arr = (Array_i32){.data = _arr_data_1, .length = 5, .capacity = 5};
    Array_i32 result = filterAbove_Array_i32_i32(arr, 3);
    printf("%s\n", tsc_array_join_i32(result, STR_LIT(", ")).data);
    return 0;
}
