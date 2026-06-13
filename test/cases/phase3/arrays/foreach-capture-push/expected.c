#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct { int32_t factor; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    free(env);
}

static void _closure_0_fn(_closure_0_env *env, int32_t x) {
    printf("%d\n", x * env->factor);
}

static _closure_0_env *_tsc_cb_env_0;
static void _closure_0_adapter(int32_t _p0) {
    return _closure_0_fn(_tsc_cb_env_0, _p0);
}

void printScaled_Array_i32_i32(Array_i32 items, int32_t factor) {
    _closure_0_env *_cb_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_cb_env_0 = (_closure_0_env){.factor = factor};
    _tsc_cb_env_0 = _cb_env_0;
    tsc_array_foreach_i32(items, _closure_0_adapter);
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {10, 20, 30};
    Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    printScaled_Array_i32_i32(arr, 3);
    return 0;
}
