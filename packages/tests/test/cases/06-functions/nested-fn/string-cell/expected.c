#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; String msg; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
    tsc_string_release(env->msg);
}

static String _nested_1_get(_nested_0_env *env) {
    tsc_string_retain(env->msg);
    return env->msg;
}

void _tsc_main(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    tsc_closure get = {.env = env, .fn = (void*)_nested_1_get};
    env->msg = STR_LIT("hi");
    printf("%s\n", ((String (*)(void *))get.fn)(get.env).data);
    env->msg = STR_LIT("ok");
    printf("%s\n", ((String (*)(void *))get.fn)(get.env).data);
    tsc_env_release(env);
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
