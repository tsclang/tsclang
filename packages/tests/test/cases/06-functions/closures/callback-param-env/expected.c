#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double n; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_1_fn(_closure_1_env *env) {
    env->_outer->n = env->_outer->n + 1;
    return env->_outer->n;
}

double twice_fn_f64(tsc_closure f) {
    return ((double (*)(void *))f.fn)(f.env) + ((double (*)(void *))f.fn)(f.env);
}

void run(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->n = 10;
    tsc_env_retain(env);
    _closure_1_env *_cb_env_1 = tsc_malloc(sizeof(_closure_1_env));
    *_cb_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    printf("%s\n", tsc_dtoa((double)(twice_fn_f64((tsc_closure){.env = _cb_env_1, .fn = (void*)_closure_1_fn}))));
    printf("%s\n", tsc_dtoa((double)(env->n)));
    tsc_env_release(env);
}

int main(void) {
    TSC_INIT();
    run();
    return 0;
}
