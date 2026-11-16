#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double a; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->a + 1;
}

int main(void) {
    TSC_INIT();
    double result = 0.0;
    {
        double a = 10.0;
        _closure_0_env *f_env = tsc_malloc(sizeof(_closure_0_env));
        *f_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .a = a};
        tsc_closure f = {.env = f_env, .fn = (void*)_closure_0_fn};
        result = ((int32_t (*)(void *))f.fn)(f.env);
        tsc_env_release(f_env);
    }
    printf("%s\n", tsc_dtoa((double)(result)));
    return 0;
}
