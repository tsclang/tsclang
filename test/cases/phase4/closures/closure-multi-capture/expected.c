#include "runtime.h"

typedef struct { int32_t a; int32_t b; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->a + env->b;
}

typedef struct { _closure_0_env env; int32_t (*fn)(_closure_0_env *); } _closure_0;

int main(void) {
    TSC_INIT();
    int32_t a = 3;
    int32_t b = 4;
    _closure_0 sum = {.env = {.a = a, .b = b}, .fn = _closure_0_fn};
    printf("%d\n", sum.fn(&sum.env));
    return 0;
}
