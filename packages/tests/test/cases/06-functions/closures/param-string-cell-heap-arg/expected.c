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

static String _closure_1_fn(_closure_1_env *env) {
    return tsc_string_concat(env->_outer->prefix, STR_LIT("!"));
}

tsc_closure greet_string(String prefix) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->prefix = prefix;
    tsc_string_retain(env->prefix);
    tsc_env_retain(env);
    _closure_1_env *f_env = tsc_malloc(sizeof(_closure_1_env));
    *f_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    tsc_closure f = {.env = f_env, .fn = (void*)_closure_1_fn};
    tsc_env_release(env);
    return f;
}

int main(void) {
    TSC_INIT();
    tsc_closure g = greet_string(tsc_string_concat(STR_LIT("aaaa"), STR_LIT("bbbb")));
    printf("%s\n", ((String (*)(void *))g.fn)(g.env).data);
    tsc_env_release(g.env);
    return 0;
}
