#include "runtime.h"

static int32_t _lambda_0_i32(void *_env) {
    return -1;
}

static int32_t _lambda_1_i32(void *_env) {
    return -1;
}

typedef struct { tsc_env_hdr _hdr; int32_t i; } _nested_1_env;

static void _nested_1_env_destroy(void *_env) {
    _nested_1_env *env = (_nested_1_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_1_env *_outer; } _closure_2_env;

static void _closure_2_destroy(void *_env) {
    _closure_2_env *env = (_closure_2_env *)_env;
    tsc_env_release(env->_outer);
}

static int32_t _closure_2_fn(_closure_2_env *env) {
    return env->_outer->i;
}

void _tsc_main(void) {
    tsc_closure a = {.env = NULL, .fn = (void*)_lambda_0_i32};
    tsc_closure b = {.env = NULL, .fn = (void*)_lambda_1_i32};
    for (int32_t i = 0; i < 2; i++) {
        _nested_1_env *env = tsc_malloc(sizeof(_nested_1_env));
        *env = (_nested_1_env){._hdr = {._refcount = 1, ._destroy = _nested_1_env_destroy}};
        env->i = i;
        tsc_env_retain(env);
        _closure_2_env *f_env = tsc_malloc(sizeof(_closure_2_env));
        *f_env = (_closure_2_env){._hdr = {._refcount = 1, ._destroy = _closure_2_destroy}, ._outer = env};
        tsc_closure f = {.env = f_env, .fn = (void*)_closure_2_fn};
        if (env->i == 0) {
            { void *_old_env_0 = a.env;
              a = f;
              tsc_env_retain(a.env);
              tsc_env_release(_old_env_0); }
        } else {
            { void *_old_env_1 = b.env;
              b = f;
              tsc_env_retain(b.env);
              tsc_env_release(_old_env_1); }
        }
        tsc_env_release(f_env);
        i = env->i;
        tsc_env_release(env);
    }
    printf("%d\n", ((int32_t (*)(void *))a.fn)(a.env));
    printf("%d\n", ((int32_t (*)(void *))b.fn)(b.env));
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
