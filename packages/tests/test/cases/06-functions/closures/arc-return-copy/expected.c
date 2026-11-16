#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

typedef struct { tsc_env_hdr _hdr; double x; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->x = env->x + 1;
    return env->x;
}

tsc_closure makePair(void) {
    double x = 5.0;
    _closure_0_env *a_env = tsc_malloc(sizeof(_closure_0_env));
    *a_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .x = x};
    tsc_closure a = {.env = a_env, .fn = (void*)_closure_0_fn};
    const tsc_closure b = a;
    tsc_env_retain(b.env);
    tsc_env_release(a_env);
    return b;
}

int main(void) {
    TSC_INIT();
    tsc_closure g = makePair();
    Array_f64 sink = {.data = NULL, .length = 0, .capacity = 0};
    for (double i = 0; i < 100; i++) {
        tsc_array_push_f64(&sink, i);
        tsc_array_free_f64(&sink);
    }
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))g.fn)(g.env))));
    tsc_env_release(g.env);
    return 0;
}
