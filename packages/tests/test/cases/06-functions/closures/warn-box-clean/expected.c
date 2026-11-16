#include "runtime.h"

typedef struct { double v; } Cell;

typedef struct { tsc_env_hdr _hdr; Cell *c; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->c->v = env->c->v + 1;
    return env->c->v;
}

int main(void) {
    TSC_INIT();
    Cell c = { .v = 1 };
    _closure_0_env *f_env = tsc_malloc(sizeof(_closure_0_env));
    *f_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .c = &c};
    tsc_closure f = {.env = f_env, .fn = (void*)_closure_0_fn};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    printf("%s\n", tsc_dtoa((double)(c.v)));
    tsc_env_release(f_env);
    return 0;
}
