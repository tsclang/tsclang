#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

#define tsc_array_free_tsc_closure(arr) do { Array_tsc_closure *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_env_release(_a_->data[_i_].env); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_tsc_closure(arr, ...) do { Array_tsc_closure *_a_ = (arr); tsc_closure _v_ = (__VA_ARGS__); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (tsc_closure*)realloc(_a_->data, _nc_ * sizeof(tsc_closure)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

static int32_t _fn_adapter_0_square_i32(void *_env, int32_t _a0);

int32_t square_i32(int32_t x) {
    return (int32_t)((uint32_t)x * (uint32_t)x);
}

static int32_t _fn_adapter_0_square_i32(void *_env, int32_t _a0) {
    return square_i32(_a0);
}

int main(void) {
    TSC_INIT();
    tsc_closure _fns_lit[] = {(tsc_closure){.env = NULL, .fn = (void*)_fn_adapter_0_square_i32}};
    const Array_tsc_closure fns = {.data = _fns_lit, .length = 1, .capacity = 1};
    printf("%d\n", ((int32_t (*)(void *, int32_t))fns.data[0].fn)(fns.data[0].env, 4));
    for (size_t _ci = 0; _ci < fns.length; _ci++) tsc_env_release(fns.data[_ci].env);
    return 0;
}
