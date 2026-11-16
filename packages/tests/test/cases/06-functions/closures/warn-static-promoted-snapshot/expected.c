#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double counter; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->counter = env->counter + 1;
    return env->counter;
}

static double counter = 0.0;

void bump(void) {
    counter = counter + 1;
}

int main(void) {
    TSC_INIT();
    _closure_0_env *f_env = tsc_malloc(sizeof(_closure_0_env));
    *f_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .counter = counter};
    tsc_closure f = {.env = f_env, .fn = (void*)_closure_0_fn};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    bump();
    printf("%s\n", tsc_dtoa((double)(counter)));
    tsc_env_release(f_env);
    return 0;
}
