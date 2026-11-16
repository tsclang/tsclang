#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t n; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static int32_t _closure_1_fn(_closure_1_env *env, int32_t x) {
    return (int32_t)((uint32_t)x + (uint32_t)env->_outer->n);
}

tsc_closure makeAdder_i32(int32_t n) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->n = n;
    tsc_env_retain(env);
    _closure_1_env *_lambda_env_1 = tsc_malloc(sizeof(_closure_1_env));
    *_lambda_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    tsc_closure _ret_0 = (tsc_closure){.env = _lambda_env_1, .fn = (void*)_closure_1_fn};
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    tsc_closure f = makeAdder_i32(5);
    const int32_t y = ((int32_t (*)(void *, int32_t))f.fn)(f.env, 3);
    printf("%d\n", y);
    tsc_env_release(f.env);
    return 0;
}
