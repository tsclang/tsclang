#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

typedef struct { tsc_env_hdr _hdr; double n; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->n = env->n + 1;
    return env->n;
}

tsc_closure makeCounter_f64(double start) {
    double n = start;
    _closure_0_env *_lambda_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_lambda_env_0 = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .n = n};
    return (tsc_closure){.env = _lambda_env_0, .fn = (void*)_closure_0_fn};
}

int main(void) {
    TSC_INIT();
    tsc_closure first = makeCounter_f64(1);
    tsc_closure _fns_lit[] = {first, makeCounter_f64(10)};
    const Array_tsc_closure fns = {.data = _fns_lit, .length = 2, .capacity = 2};
    tsc_env_retain(fns.data[0].env);
    ((double (*)(void *))fns.data[0].fn)(fns.data[0].env);
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[0].fn)(fns.data[0].env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[1].fn)(fns.data[1].env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))first.fn)(first.env))));
    for (size_t _ci = 0; _ci < fns.length; _ci++) tsc_env_release(fns.data[_ci].env);
    tsc_env_release(first.env);
    return 0;
}
