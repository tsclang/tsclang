#include "runtime.h"

typedef struct { int32_t count; } Counter;

typedef struct { Counter *c; } _closure_0_env;

static void _closure_0_fn(_closure_0_env *env) {
    env->c->count += 10;
}

int main(void) {
    TSC_INIT();
    Counter c = {0};
    c.count = 5;
    _closure_0_env fn_env = {.c = &c};
    tsc_closure fn = {.env = &fn_env, .fn = (void*)_closure_0_fn};
    ((void (*)(void *))fn.fn)(fn.env);
    printf("%d\n", c.count);
    return 0;
}
