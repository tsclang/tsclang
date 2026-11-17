#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double i; } _nested_1_env;

static void _nested_1_env_destroy(void *_env) {
    _nested_1_env *env = (_nested_1_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_1_env *_outer; } _closure_2_env;

static void _closure_2_destroy(void *_env) {
    _closure_2_env *env = (_closure_2_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_2_fn(_closure_2_env *env) {
    env->_outer->i = env->_outer->i + 10;
    return env->_outer->i;
}

static double _lambda_0_f64(void *_env) {
    double sum = 0.0;
    for (double i = 0; i < 3; i++) {
        _nested_1_env *env = tsc_malloc(sizeof(_nested_1_env));
        *env = (_nested_1_env){._hdr = {._refcount = 1, ._destroy = _nested_1_env_destroy}};
        env->i = i;
        tsc_env_retain(env);
        _closure_2_env *g_env = tsc_malloc(sizeof(_closure_2_env));
        *g_env = (_closure_2_env){._hdr = {._refcount = 1, ._destroy = _closure_2_destroy}, ._outer = env};
        tsc_closure g = {.env = g_env, .fn = (void*)_closure_2_fn};
        ((double (*)(void *))g.fn)(g.env);
        sum = sum + env->i;
        tsc_env_release(g_env);
        i = env->i;
        tsc_env_release(env);
    }
    return sum;
}

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_f64};
    String _tmp_0 = tsc_string_format("%s", tsc_dtoa(((double (*)(void *))f.fn)(f.env)));
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    return 0;
}
