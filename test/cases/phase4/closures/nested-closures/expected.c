#include "runtime.h"

typedef struct { int32_t count; } Counter;

typedef struct { Counter *c; } _closure_0_env;

typedef struct { Counter *c; } _closure_1_env;

static void _closure_1_fn(_closure_1_env *env) {
    env->c->count += 10;
}

static void _closure_0_fn(_closure_0_env *env) {
    env->c->count += 1;
    _closure_1_env inner_env = {.c = env->c};
    tsc_closure inner = {.env = &inner_env, .fn = (void*)_closure_1_fn};
    ((void (*)(void *))inner.fn)(inner.env);
}

int main(void) {
    TSC_INIT();
    Counter c = {0};
    c.count = 0;
    _closure_0_env outer_env = {.c = &c};
    tsc_closure outer = {.env = &outer_env, .fn = (void*)_closure_0_fn};
    ((void (*)(void *))outer.fn)(outer.env);
    printf("%d\n", c.count);
    return 0;
}
