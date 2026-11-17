#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double x; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; double y; } _nested_1_env;

static void _nested_1_env_destroy(void *_env) {
    _nested_1_env *env = (_nested_1_env *)_env;
    tsc_env_release(env->_outer);
}

typedef struct { tsc_env_hdr _hdr; _nested_1_env *_outer; } _closure_2_env;

static void _closure_2_destroy(void *_env) {
    _closure_2_env *env = (_closure_2_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_2_fn(_closure_2_env *env) {
    env->_outer->_outer->x = env->_outer->_outer->x + 1;
    env->_outer->y = env->_outer->y + 1;
    return env->_outer->_outer->x * 10 + env->_outer->y;
}

double f(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->x = 1;
    {
        _nested_1_env *_blk_env1 = tsc_malloc(sizeof(_nested_1_env));
        *_blk_env1 = (_nested_1_env){._hdr = {._refcount = 1, ._destroy = _nested_1_env_destroy}, ._outer = env};
        tsc_env_retain(env);
        _blk_env1->y = 2;
        tsc_env_retain(_blk_env1);
        _closure_2_env *g_env = tsc_malloc(sizeof(_closure_2_env));
        *g_env = (_closure_2_env){._hdr = {._refcount = 1, ._destroy = _closure_2_destroy}, ._outer = _blk_env1};
        tsc_closure g = {.env = g_env, .fn = (void*)_closure_2_fn};
        ((double (*)(void *))g.fn)(g.env);
        double _ret_0 = env->x * 100 + _blk_env1->y;
        tsc_env_release(g_env);
        tsc_env_release(_blk_env1);
        tsc_env_release(env);
        return _ret_0;
    }
}

int main(void) {
    TSC_INIT();
    String _tmp_1 = tsc_string_format("%s", tsc_dtoa(f()));
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    return 0;
}
