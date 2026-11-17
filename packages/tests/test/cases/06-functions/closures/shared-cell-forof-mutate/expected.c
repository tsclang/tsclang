#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct { tsc_env_hdr _hdr; int32_t x; } _nested_1_env;

static void _nested_1_env_destroy(void *_env) {
    _nested_1_env *env = (_nested_1_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_1_env *_outer; } _closure_2_env;

static void _closure_2_destroy(void *_env) {
    _closure_2_env *env = (_closure_2_env *)_env;
    tsc_env_release(env->_outer);
}

static int32_t _closure_2_fn(_closure_2_env *env) {
    return env->_outer->x;
}

void _tsc_main(void) {
    int32_t _arr_data_0[] = {10, 20};
    Array_i32 items = (Array_i32){.data = _arr_data_0, .length = 2, .capacity = 2};
    int32_t total = 0;
    for (size_t _i_0 = 0; _i_0 < items.length; _i_0++) {
        int32_t x = items.data[_i_0];
        _nested_1_env *env = tsc_malloc(sizeof(_nested_1_env));
        *env = (_nested_1_env){._hdr = {._refcount = 1, ._destroy = _nested_1_env_destroy}};
        env->x = x;
        tsc_env_retain(env);
        _closure_2_env *f_env = tsc_malloc(sizeof(_closure_2_env));
        *f_env = (_closure_2_env){._hdr = {._refcount = 1, ._destroy = _closure_2_destroy}, ._outer = env};
        tsc_closure f = {.env = f_env, .fn = (void*)_closure_2_fn};
        env->x = env->x + 1;
        total = (int32_t)((uint32_t)total + (uint32_t)((int32_t (*)(void *))f.fn)(f.env));
        tsc_env_release(f_env);
        tsc_env_release(env);
    }
    printf("%d\n", total);
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
