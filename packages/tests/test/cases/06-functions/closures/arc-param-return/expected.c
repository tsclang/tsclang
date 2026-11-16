#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

typedef struct { tsc_env_hdr _hdr; double base; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->base = env->base + 1;
    return env->base;
}

tsc_closure delegate_fn_f64(tsc_closure f) {
    tsc_env_retain((f).env);
    return f;
}

int main(void) {
    TSC_INIT();
    tsc_closure g = (tsc_closure){0};
    {
        double base = 7.0;
        _closure_0_env *orig_env = tsc_malloc(sizeof(_closure_0_env));
        *orig_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .base = base};
        tsc_closure orig = {.env = orig_env, .fn = (void*)_closure_0_fn};
        { void *_old_env_0 = g.env;
          g = delegate_fn_f64((tsc_closure){.env = orig_env, .fn = (void*)_closure_0_fn});
          tsc_env_release(_old_env_0); }
        ((double (*)(void *))orig.fn)(orig.env);
        tsc_env_release(orig_env);
    }
    Array_f64 sink = {.data = NULL, .length = 0, .capacity = 0};
    for (double i = 0; i < 100; i++) {
        tsc_array_push_f64(&sink, i);
        tsc_array_free_f64(&sink);
    }
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))g.fn)(g.env))));
    tsc_env_release(g.env);
    return 0;
}
