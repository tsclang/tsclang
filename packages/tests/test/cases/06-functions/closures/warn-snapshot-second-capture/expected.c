#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double a; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->a = env->a + 1;
    return env->a;
}

typedef struct { tsc_env_hdr _hdr; double a; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
}

static double _closure_1_fn(_closure_1_env *env) {
    return env->a;
}

int main(void) {
    TSC_INIT();
    double a = 1.0;
    _closure_0_env *inc_env = tsc_malloc(sizeof(_closure_0_env));
    *inc_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .a = a};
    tsc_closure inc = {.env = inc_env, .fn = (void*)_closure_0_fn};
    _closure_1_env *get_env = tsc_malloc(sizeof(_closure_1_env));
    *get_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, .a = a};
    tsc_closure get = {.env = get_env, .fn = (void*)_closure_1_fn};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))inc.fn)(inc.env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))get.fn)(get.env))));
    tsc_env_release(get_env);
    tsc_env_release(inc_env);
    return 0;
}
