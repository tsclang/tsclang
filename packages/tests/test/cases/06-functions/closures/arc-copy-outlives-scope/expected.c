#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

typedef struct { tsc_env_hdr _hdr; double n; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
}

static double _closure_1_fn(_closure_1_env *env) {
    env->n = env->n + 1;
    return env->n;
}

int main(void) {
    TSC_INIT();
    double n = 100.0;
    tsc_closure kept = (tsc_closure){0};
    {
        _closure_1_env *c_env = tsc_malloc(sizeof(_closure_1_env));
        *c_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, .n = n};
        tsc_closure c = {.env = c_env, .fn = (void*)_closure_1_fn};
        ((double (*)(void *))c.fn)(c.env);
        { void *_old_env_0 = kept.env;
          kept = c;
          tsc_env_retain(kept.env);
          tsc_env_release(_old_env_0); }
        tsc_env_release(c_env);
    }
    Array_f64 sink = {.data = NULL, .length = 0, .capacity = 0};
    for (double i = 0; i < 100; i++) {
        tsc_array_push_f64(&sink, i);
        tsc_array_free_f64(&sink);
    }
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))kept.fn)(kept.env))));
    tsc_env_release(kept.env);
    return 0;
}
