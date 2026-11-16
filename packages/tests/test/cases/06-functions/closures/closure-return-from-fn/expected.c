#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double n; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->n;
}

typedef struct { tsc_env_hdr _hdr; double m; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
}

static int32_t _closure_1_fn(_closure_1_env *env) {
    return env->m;
}

int main(void) {
    TSC_INIT();
    double n = 5.0;
    _closure_0_env *add5_env = tsc_malloc(sizeof(_closure_0_env));
    *add5_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .n = n};
    tsc_closure add5 = {.env = add5_env, .fn = (void*)_closure_0_fn};
    double m = 10.0;
    _closure_1_env *add10_env = tsc_malloc(sizeof(_closure_1_env));
    *add10_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, .m = m};
    tsc_closure add10 = {.env = add10_env, .fn = (void*)_closure_1_fn};
    printf("%d\n", ((int32_t (*)(void *))add5.fn)(add5.env));
    printf("%d\n", ((int32_t (*)(void *))add10.fn)(add10.env));
    tsc_env_release(add10_env);
    tsc_env_release(add5_env);
    return 0;
}
