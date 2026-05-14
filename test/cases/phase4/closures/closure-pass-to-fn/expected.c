#include "runtime.h"

typedef struct { int32_t x; int32_t y; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->x + env->y;
}

typedef struct { _closure_0_env env; int32_t (*fn)(_closure_0_env *); } _closure_0;

int main(void) {
    TSC_INIT();
    int32_t x = 7;
    int32_t y = 3;
    _closure_0 add = {.env = {.x = x, .y = y}, .fn = _closure_0_fn};
    printf("%d\n", add.fn(&add.env));
    return 0;
}
