#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; String prefix; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
    tsc_string_release(env->prefix);
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static String _closure_1_fn(_closure_1_env *env, String name) {
    return tsc_string_concat(env->_outer->prefix, name);
}

tsc_closure makeGreeter_string(String prefix) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->prefix = prefix;
    tsc_string_retain(env->prefix);
    tsc_env_retain(env);
    _closure_1_env *_lambda_env_1 = tsc_malloc(sizeof(_closure_1_env));
    *_lambda_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    tsc_closure _ret_0 = (tsc_closure){.env = _lambda_env_1, .fn = (void*)_closure_1_fn};
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    tsc_closure g = makeGreeter_string(STR_LIT("Hello, "));
    const tsc_closure g2 = g;
    tsc_env_retain(g2.env);
    printf("%s\n", ((String (*)(void *, String))g2.fn)(g2.env, STR_LIT("World")).data);
    tsc_env_release(g2.env);
    tsc_env_release(g.env);
    return 0;
}
