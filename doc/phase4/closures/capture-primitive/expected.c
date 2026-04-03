#include "runtime.h"

typedef struct { int32_t base; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env, int32_t x) {
    return env->base + x;
}

typedef struct { _closure_0_env env; int32_t (*fn)(_closure_0_env *, int32_t); } _closure_0;

int main(void) {
    TSC_INIT();
    const int32_t base = 10;
    _closure_0 add = {.env = {.base = base}, .fn = _closure_0_fn};
    printf("%d\n", add.fn(&add.env, 5));
    return 0;
}
