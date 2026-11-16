#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double count; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->count = env->count + 1;
    return env->count;
}

tsc_closure makeCounter(void) {
    double count = 0.0;
    _closure_0_env *_lambda_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_lambda_env_0 = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .count = count};
    return (tsc_closure){.env = _lambda_env_0, .fn = (void*)_closure_0_fn};
}

int main(void) {
    TSC_INIT();
    tsc_closure c = makeCounter();
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))c.fn)(c.env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))c.fn)(c.env))));
    tsc_env_release(c.env);
    return 0;
}
