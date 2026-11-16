#include "runtime.h"

typedef struct { double n; } _anon_0;

typedef struct { tsc_env_hdr _hdr; _anon_0 *o; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
}

static double _closure_1_fn(_closure_1_env *env) {
    env->o->n = env->o->n + 1;
    return env->o->n;
}

int main(void) {
    TSC_INIT();
    {
        _anon_0 o = { .n = 1 };
        _closure_1_env *f_env = tsc_malloc(sizeof(_closure_1_env));
        *f_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, .o = &o};
        tsc_closure f = {.env = f_env, .fn = (void*)_closure_1_fn};
        printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
        printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
        printf("%s\n", tsc_dtoa((double)(o.n)));
        tsc_env_release(f_env);
    }
    return 0;
}
