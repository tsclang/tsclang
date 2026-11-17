#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double a; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_3_env;

static void _closure_3_destroy(void *_env) {
    _closure_3_env *env = (_closure_3_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_3_fn(_closure_3_env *env) {
    env->_outer->a = env->_outer->a + 1;
    return env->_outer->a;
}

static double _nested_1_g(_nested_0_env *env) {
    tsc_env_retain(env);
    _closure_3_env *h_env = tsc_malloc(sizeof(_closure_3_env));
    *h_env = (_closure_3_env){._hdr = {._refcount = 1, ._destroy = _closure_3_destroy}, ._outer = env};
    tsc_closure h = {.env = h_env, .fn = (void*)_closure_3_fn};
    ((double (*)(void *))h.fn)(h.env);
    double _ret_1 = env->a;
    tsc_env_release(h_env);
    return _ret_1;
}

double f(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    tsc_closure g = {.env = env, .fn = (void*)_nested_1_g};
    env->a = 1;
    double _ret_0 = ((double (*)(void *))g.fn)(g.env);
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    String _tmp_2 = tsc_string_format("%s", tsc_dtoa(f()));
    printf("%s\n", _tmp_2.data);
    tsc_string_release(_tmp_2);
    return 0;
}
