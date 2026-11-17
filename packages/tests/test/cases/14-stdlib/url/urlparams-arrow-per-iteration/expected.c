#include "runtime.h"
#include "std/url.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

#define tsc_array_free_tsc_closure(arr) do { Array_tsc_closure *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_env_release(_a_->data[_i_].env); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_tsc_closure(arr, ...) do { Array_tsc_closure *_a_ = (arr); tsc_closure _v_ = (__VA_ARGS__); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (tsc_closure*)realloc(_a_->data, _nc_ * sizeof(tsc_closure)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

typedef struct { tsc_env_hdr _hdr; String k; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
    tsc_string_release(env->k);
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static String _closure_1_fn(_closure_1_env *env) {
    return env->_outer->k;
}

int main(void) {
    TSC_INIT();
    TscURL u = tsc_url_parse(STR_LIT("https://example.com/?a=1&b=2"));
    Array_tsc_closure fs = {0};
    TscURLParamIter _iter_0 = tsc_url_params_iter(&u);
    TscURLParam _p_0 = {0};
    while (tsc_url_params_next(&_iter_0, &_p_0)) {
        String k = _p_0.key;
        String v = _p_0.value;
        _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
        *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
        env->k = k;
        tsc_string_retain(env->k);
        tsc_env_retain(env);
        _closure_1_env *_lambda_env_1 = tsc_malloc(sizeof(_closure_1_env));
        *_lambda_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
        tsc_array_push_tsc_closure(&fs, (tsc_closure){.env = _lambda_env_1, .fn = (void*)_closure_1_fn});
        { String _tsc_tmp = tsc_string_concat(env->k, STR_LIT("!")); tsc_string_release(env->k); env->k = _tsc_tmp; }
        tsc_env_release(env);
    }
    String _tmp_0 = tsc_string_concat_n((String[]){ ((String (*)(void *))fs.data[0].fn)(fs.data[0].env), STR_LIT(" "), ((String (*)(void *))fs.data[1].fn)(fs.data[1].env) }, 3);
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    tsc_array_free_tsc_closure(&fs);
    tsc_url_free(&u);
    return 0;
}
