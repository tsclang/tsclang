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

typedef struct { tsc_env_hdr _hdr; _closure_1_env *_outer; } _closure_3_env;

static void _closure_3_destroy(void *_env) {
    _closure_3_env *env = (_closure_3_env *)_env;
    tsc_env_release(env->_outer);
}

static void _closure_3_fn(_closure_3_env *env) {
    env->_outer->_outer->x = env->_outer->_outer->x + 1;
}

static double _closure_1_fn(_closure_1_env *env) {
    tsc_env_retain(env);
    _closure_3_env *l3_env = tsc_malloc(sizeof(_closure_3_env));
    *l3_env = (_closure_3_env){._hdr = {._refcount = 1, ._destroy = _closure_3_destroy}, ._outer = env};
    tsc_closure l3 = {.env = l3_env, .fn = (void*)_closure_3_fn};
    ((void (*)(void *))l3.fn)(l3.env);
    ((void (*)(void *))l3.fn)(l3.env);
    double _ret_0 = env->_outer->x;
    tsc_env_release(l3_env);
    return _ret_0;
}

static double _lambda_0_f64(void *_env) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->x = 1;
    tsc_env_retain(env);
    _closure_1_env *l2_env = tsc_malloc(sizeof(_closure_1_env));
    *l2_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    tsc_closure l2 = {.env = l2_env, .fn = (void*)_closure_1_fn};
    double _ret_1 = ((double (*)(void *))l2.fn)(l2.env);
    tsc_env_release(l2_env);
    tsc_env_release(env);
    return _ret_1;
}

int main(void) {
    TSC_INIT();
    tsc_closure l1 = {.env = NULL, .fn = (void*)_lambda_0_f64};
    String _tmp_2 = tsc_string_format("%s", tsc_dtoa(((double (*)(void *))l1.fn)(l1.env)));
    printf("%s\n", _tmp_2.data);
    tsc_string_release(_tmp_2);
    return 0;
}
