#include "runtime.h"

typedef struct { int32_t count; } Counter;

typedef struct { Counter *c; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    free(env);
}

static void _closure_0_fn(_closure_0_env *env) {
    env->c->count = (int32_t)((uint32_t)env->c->count + (uint32_t)10);
}

int main(void) {
    TSC_INIT();
    Counter c = {0};
    c.count = 5;
    _closure_0_env *fn_env = tsc_malloc(sizeof(_closure_0_env));
    *fn_env = (_closure_0_env){.c = &c};
    tsc_closure fn = {.env = fn_env, .fn = (void*)_closure_0_fn};
    ((void (*)(void *))fn.fn)(fn.env);
    printf("%d\n", c.count);
    _closure_0_destroy(fn_env);
    return 0;
}
