#include "runtime.h"

typedef struct { double n; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    free(env);
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->n;
}

typedef struct { double m; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    free(env);
}

static int32_t _closure_1_fn(_closure_1_env *env) {
    return env->m;
}

int main(void) {
    TSC_INIT();
    double n = 5.0;
    _closure_0_env *add5_env = tsc_malloc(sizeof(_closure_0_env));
    *add5_env = (_closure_0_env){.n = n};
    tsc_closure add5 = {.env = add5_env, .fn = (void*)_closure_0_fn};
    double m = 10.0;
    _closure_1_env *add10_env = tsc_malloc(sizeof(_closure_1_env));
    *add10_env = (_closure_1_env){.m = m};
    tsc_closure add10 = {.env = add10_env, .fn = (void*)_closure_1_fn};
    printf("%d\n", ((int32_t (*)(void *))add5.fn)(add5.env));
    printf("%d\n", ((int32_t (*)(void *))add10.fn)(add10.env));
    _closure_1_destroy(add10_env);
    _closure_0_destroy(add5_env);
    return 0;
}
