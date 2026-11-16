#include "runtime.h"

typedef struct { double n; } _anon_0;

typedef struct { tsc_env_hdr _hdr; _anon_0 *o; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->o->n = env->o->n + 1;
    return env->o->n;
}

int main(void) {
    TSC_INIT();
    _anon_0 o = { .n = 1 };
    _closure_0_env *f_env = tsc_malloc(sizeof(_closure_0_env));
    *f_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .o = &o};
    tsc_closure f = {.env = f_env, .fn = (void*)_closure_0_fn};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    printf("%s\n", tsc_dtoa((double)(o.n)));
    tsc_env_release(f_env);
    return 0;
}
