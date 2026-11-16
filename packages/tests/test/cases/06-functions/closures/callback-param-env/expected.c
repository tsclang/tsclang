#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double n; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->n = env->n + 1;
    return env->n;
}

double twice_fn_f64(tsc_closure f) {
    return ((double (*)(void *))f.fn)(f.env) + ((double (*)(void *))f.fn)(f.env);
}

int main(void) {
    TSC_INIT();
    double n = 10.0;
    _closure_0_env *_cb_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_cb_env_0 = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .n = n};
    printf("%s\n", tsc_dtoa((double)(twice_fn_f64((tsc_closure){.env = _cb_env_0, .fn = (void*)_closure_0_fn}))));
    printf("%s\n", tsc_dtoa((double)(n)));
    return 0;
}
