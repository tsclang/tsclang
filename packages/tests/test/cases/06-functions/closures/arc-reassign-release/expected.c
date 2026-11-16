#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double n; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->n = env->n + 1;
    return env->n;
}

tsc_closure makeCounter_f64(double start) {
    double n = start;
    _closure_0_env *_lambda_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_lambda_env_0 = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .n = n};
    return (tsc_closure){.env = _lambda_env_0, .fn = (void*)_closure_0_fn};
}

int main(void) {
    TSC_INIT();
    tsc_closure f = makeCounter_f64(10);
    ((double (*)(void *))f.fn)(f.env);
    { void *_old_env_0 = f.env;
      f = makeCounter_f64(20);
      tsc_env_release(_old_env_0); }
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    tsc_env_release(f.env);
    return 0;
}
