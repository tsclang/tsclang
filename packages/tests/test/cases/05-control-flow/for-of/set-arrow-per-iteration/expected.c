#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

#define tsc_array_free_tsc_closure(arr) do { Array_tsc_closure *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_env_release(_a_->data[_i_].env); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_tsc_closure(arr, ...) do { Array_tsc_closure *_a_ = (arr); tsc_closure _v_ = (__VA_ARGS__); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (tsc_closure*)realloc(_a_->data, _nc_ * sizeof(tsc_closure)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

typedef struct { tsc_env_hdr _hdr; int32_t v; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static int32_t _closure_1_fn(_closure_1_env *env) {
    return env->_outer->v;
}

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    tsc_set_add_i32(&s, 1);
    tsc_set_add_i32(&s, 2);
    tsc_set_add_i32(&s, 3);
    Array_tsc_closure fs = {0};
    for (size_t _i_0 = 0; _i_0 < s.size; _i_0++) {
        int32_t v = s._vals[_i_0];
        _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
        *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
        env->v = v;
        tsc_env_retain(env);
        _closure_1_env *_lambda_env_1 = tsc_malloc(sizeof(_closure_1_env));
        *_lambda_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
        tsc_array_push_tsc_closure(&fs, (tsc_closure){.env = _lambda_env_1, .fn = (void*)_closure_1_fn});
        env->v = env->v + 100;
        tsc_env_release(env);
    }
    String _tmp_0 = tsc_string_format("%d %d %d", ((int32_t (*)(void *))fs.data[0].fn)(fs.data[0].env), ((int32_t (*)(void *))fs.data[1].fn)(fs.data[1].env), ((int32_t (*)(void *))fs.data[2].fn)(fs.data[2].env));
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    tsc_array_free_tsc_closure(&fs);
    return 0;
}
