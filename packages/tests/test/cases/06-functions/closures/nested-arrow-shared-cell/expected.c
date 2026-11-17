#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double x; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_1_fn(_closure_1_env *env) {
    env->_outer->x = env->_outer->x + 1;
    return env->_outer->x;
}

static double _lambda_0_f64(void *_env) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->x = 1;
    tsc_env_retain(env);
    _closure_1_env *inner_env = tsc_malloc(sizeof(_closure_1_env));
    *inner_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    tsc_closure inner = {.env = inner_env, .fn = (void*)_closure_1_fn};
    ((double (*)(void *))inner.fn)(inner.env);
    ((double (*)(void *))inner.fn)(inner.env);
    double _ret_0 = env->x;
    tsc_env_release(inner_env);
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    tsc_closure outer = {.env = NULL, .fn = (void*)_lambda_0_f64};
    String _tmp_1 = tsc_string_format("%s", tsc_dtoa(((double (*)(void *))outer.fn)(outer.env)));
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    return 0;
}
