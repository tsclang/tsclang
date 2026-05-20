#include "runtime.h"

typedef struct { int32_t value; } Data;

typedef struct { Data d; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->d.value;
}

int main(void) {
    TSC_INIT();
    Data d = {0};
    d.value = 42;
    _closure_0_env getVal_env = {.d = d};
    tsc_closure getVal = {.env = &getVal_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *))getVal.fn)(getVal.env));
    return 0;
}
