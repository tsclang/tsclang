#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct { int32_t factor; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    free(env);
}

static double _closure_0_fn(_closure_0_env *env, double acc, int32_t x) {
    return acc + (int32_t)((uint32_t)x * (uint32_t)env->factor);
}

static _closure_0_env *_tsc_cb_env_0;
static double _closure_0_adapter(double _p0, int32_t _p1) {
    return _closure_0_fn(_tsc_cb_env_0, _p0, _p1);
}

int32_t sumScaled_Array_i32_i32(Array_i32 items, int32_t factor) {
    _closure_0_env *_cb_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_cb_env_0 = (_closure_0_env){.factor = factor};
    _tsc_cb_env_0 = _cb_env_0;
    return tsc_array_reduce_i32_f64(items, _closure_0_adapter, 0);
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3, 4};
    Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 4, .capacity = 4};
    int32_t result = sumScaled_Array_i32_i32(arr, 10);
    printf("%d\n", result);
    return 0;
}
