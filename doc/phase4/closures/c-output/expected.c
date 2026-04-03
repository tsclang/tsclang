#include "runtime.h"

typedef struct { int32_t factor; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env, int32_t x) {
    return env->factor * x;
}

typedef struct { _closure_0_env env; int32_t (*fn)(_closure_0_env *, int32_t); } _closure_0;

int main(void) {
    TSC_INIT();
    const int32_t factor = 3;
    _closure_0 mul = {.env = {.factor = factor}, .fn = _closure_0_fn};
    printf("%d\n", mul.fn(&mul.env, 7));
    return 0;
}
