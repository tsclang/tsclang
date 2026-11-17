#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

typedef struct { tsc_env_hdr _hdr; int32_t v; } _nested_1_env;

static void _nested_1_env_destroy(void *_env) {
    _nested_1_env *env = (_nested_1_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_1_env *_outer; } _closure_2_env;

static void _closure_2_destroy(void *_env) {
    _closure_2_env *env = (_closure_2_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_2_fn(_closure_2_env *env) {
    return env->_outer->v;
}

static double _lambda_0_f64(void *_env) {
    double sum = 0.0;
    double *_arr_data_0 = (double*)malloc(3 * sizeof(double));
    _arr_data_0[0] = 1;
    _arr_data_0[1] = 2;
    _arr_data_0[2] = 3;
    for (size_t _i_0 = 0; _i_0 < (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3}.length; _i_0++) {
        int32_t v = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3}.data[_i_0];
        _nested_1_env *env = tsc_malloc(sizeof(_nested_1_env));
        *env = (_nested_1_env){._hdr = {._refcount = 1, ._destroy = _nested_1_env_destroy}};
        env->v = v;
        tsc_env_retain(env);
        _closure_2_env *g_env = tsc_malloc(sizeof(_closure_2_env));
        *g_env = (_closure_2_env){._hdr = {._refcount = 1, ._destroy = _closure_2_destroy}, ._outer = env};
        tsc_closure g = {.env = g_env, .fn = (void*)_closure_2_fn};
        sum = sum + ((double (*)(void *))g.fn)(g.env);
        tsc_env_release(g_env);
        tsc_env_release(env);
    }
    return sum;
}

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_f64};
    String _tmp_1 = tsc_string_format("%s", tsc_dtoa(((double (*)(void *))f.fn)(f.env)));
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    return 0;
}
