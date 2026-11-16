#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

typedef struct { tsc_env_hdr _hdr; double base; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_1_fn(_closure_1_env *env) {
    env->_outer->base = env->_outer->base + 1;
    return env->_outer->base;
}

tsc_closure delegate_fn_f64(tsc_closure f) {
    tsc_env_retain((f).env);
    return f;
}

int main(void) {
    TSC_INIT();
    tsc_closure g = (tsc_closure){0};
    {
        _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
        *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
        env->base = 7;
        tsc_env_retain(env);
        _closure_1_env *orig_env = tsc_malloc(sizeof(_closure_1_env));
        *orig_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
        tsc_closure orig = {.env = orig_env, .fn = (void*)_closure_1_fn};
        { void *_old_env_0 = g.env;
          g = delegate_fn_f64((tsc_closure){.env = orig_env, .fn = (void*)_closure_1_fn});
          tsc_env_release(_old_env_0); }
        ((double (*)(void *))orig.fn)(orig.env);
        tsc_env_release(orig_env);
        tsc_env_release(env);
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
