#include "runtime.h"

typedef struct { int32_t n; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->n;
}

typedef struct { _closure_0_env env; int32_t (*fn)(_closure_0_env *); } _closure_0;

typedef struct { int32_t m; } _closure_1_env;

static int32_t _closure_1_fn(_closure_1_env *env) {
    return env->m;
}

typedef struct { _closure_1_env env; int32_t (*fn)(_closure_1_env *); } _closure_1;

int main(void) {
    TSC_INIT();
    int32_t n = 5;
    _closure_0 add5 = {.env = {.n = n}, .fn = _closure_0_fn};
    int32_t m = 10;
    _closure_1 add10 = {.env = {.m = m}, .fn = _closure_1_fn};
    printf("%d\n", add5.fn(&add5.env));
    printf("%d\n", add10.fn(&add10.env));
    return 0;
}
