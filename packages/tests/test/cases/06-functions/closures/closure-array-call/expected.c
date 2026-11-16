#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

typedef struct { tsc_env_hdr _hdr; double count; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static double _closure_0_fn(_closure_0_env *env) {
    env->count = env->count + 1;
    return env->count;
}

tsc_closure makeCounter(void) {
    double count = 0.0;
    _closure_0_env *_lambda_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_lambda_env_0 = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .count = count};
    return (tsc_closure){.env = _lambda_env_0, .fn = (void*)_closure_0_fn};
}

int main(void) {
    TSC_INIT();
    tsc_closure _fns_lit[] = {makeCounter(), makeCounter()};
    const Array_tsc_closure fns = {.data = _fns_lit, .length = 2, .capacity = 2};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[0].fn)(fns.data[0].env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[0].fn)(fns.data[0].env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[1].fn)(fns.data[1].env))));
    for (size_t _ci = 0; _ci < fns.length; _ci++) tsc_env_release(fns.data[_ci].env);
    return 0;
}
