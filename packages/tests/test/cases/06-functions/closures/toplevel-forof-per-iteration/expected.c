#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

typedef struct { tsc_env_hdr _hdr; double x; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_1_fn(_closure_1_env *env) {
    return env->_outer->x;
}

#define tsc_array_free_tsc_closure(arr) do { Array_tsc_closure *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_env_release(_a_->data[_i_].env); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_tsc_closure(arr, ...) do { Array_tsc_closure *_a_ = (arr); tsc_closure _v_ = (__VA_ARGS__); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (tsc_closure*)realloc(_a_->data, _nc_ * sizeof(tsc_closure)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

int main(void) {
    TSC_INIT();
    const Array_tsc_closure fns = {0};
    double _arr_data_0[] = {10, 20, 30};
    const Array_f64 xs = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    for (size_t _i_0 = 0; _i_0 < xs.length; _i_0++) {
        const double x = xs.data[_i_0];
        _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
        *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
        env->x = x;
        tsc_env_retain(env);
        _closure_1_env *_lambda_env_1 = tsc_malloc(sizeof(_closure_1_env));
        *_lambda_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
        tsc_array_push_tsc_closure(&fns, (tsc_closure){.env = _lambda_env_1, .fn = (void*)_closure_1_fn});
        tsc_env_release(env);
    }
    for (size_t _i_1 = 0; _i_1 < fns.length; _i_1++) {
        const tsc_closure *f = &fns.data[_i_1];
        String _tmp_1 = tsc_string_format("%s", tsc_dtoa(((double (*)(void *))f->fn)(f->env)));
        printf("%s\n", _tmp_1.data);
        tsc_string_release(_tmp_1);
    }
    tsc_array_free_tsc_closure(&fns);
    return 0;
}
