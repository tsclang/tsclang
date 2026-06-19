#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct { int32_t threshold; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    free(env);
}

static bool _closure_0_fn(_closure_0_env *env, int32_t x) {
    return x > env->threshold;
}

static _closure_0_env *_tsc_cb_env_0;
static bool _closure_0_adapter(int32_t _p0) {
    return _closure_0_fn(_tsc_cb_env_0, _p0);
}

Array_i32 filterAbove_Array_i32_i32(Array_i32 items, int32_t threshold) {
    _closure_0_env *_cb_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_cb_env_0 = (_closure_0_env){.threshold = threshold};
    _tsc_cb_env_0 = _cb_env_0;
    return tsc_array_filter_i32(items, _closure_0_adapter);
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 5, 3, 8, 2};
    Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 5, .capacity = 5};
    Array_i32 result = filterAbove_Array_i32_i32(arr, 3);
    printf("%s\n", tsc_array_join_i32(result, STR_LIT(", ")).data);
    return 0;
}
