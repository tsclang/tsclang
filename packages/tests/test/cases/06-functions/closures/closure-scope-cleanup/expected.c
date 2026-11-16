#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double a; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static int32_t _closure_1_fn(_closure_1_env *env) {
    return env->_outer->a + 1;
}

int main(void) {
    TSC_INIT();
    double result = 0.0;
    {
        _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
        *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
        env->a = 10;
        tsc_env_retain(env);
        _closure_1_env *f_env = tsc_malloc(sizeof(_closure_1_env));
        *f_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
        tsc_closure f = {.env = f_env, .fn = (void*)_closure_1_fn};
        result = ((int32_t (*)(void *))f.fn)(f.env);
        tsc_env_release(f_env);
        tsc_env_release(env);
    }
    printf("%s\n", tsc_dtoa((double)(result)));
    return 0;
}
