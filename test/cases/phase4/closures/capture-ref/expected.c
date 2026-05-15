#include "runtime.h"

typedef struct { int32_t value; } Box;

typedef struct { Box b; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->b.value;
}

int main(void) {
    TSC_INIT();
    Box b = {0};
    b.value = 10;
    _closure_0_env fn_env = {.b = b};
    tsc_closure fn = {.env = &fn_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *))fn.fn)(fn.env));
    return 0;
}
