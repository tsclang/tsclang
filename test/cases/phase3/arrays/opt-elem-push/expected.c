#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;
typedef struct { opt_i32 *data; size_t length; size_t capacity; } Array_opt_i32;

#define tsc_array_free_opt_i32(arr) do { Array_opt_i32 *_a_ = (arr); if (_a_->data && _a_->capacity > 0) free(_a_->data); _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_opt_i32(arr, val) do { Array_opt_i32 *_a_ = (arr); opt_i32 _v_ = (val); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (opt_i32*)realloc(_a_->data, _nc_ * sizeof(opt_i32)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)
#define tsc_array_pop_opt_i32(arr) ({ Array_opt_i32 *_a_ = (arr); opt_i32 _r_ = {false, 0}; if (_a_->length > 0) { _r_ = _a_->data[--_a_->length]; } _r_; })

int main(void) {
    TSC_INIT();
    Array_opt_i32 arr = {.data = NULL, .length = 0, .capacity = 0};
    tsc_array_push_opt_i32(&arr, ((opt_i32){true, 1}));
    tsc_array_push_opt_i32(&arr, ((opt_i32){false, 0}));
    tsc_array_push_opt_i32(&arr, ((opt_i32){true, 3}));
    printf("%zu\n", arr.length);
    opt_i32 _v_0 = arr.data[0];
    printf("%d\n", _v_0.has_value ? _v_0.value : 0);
    opt_i32 _v_1 = arr.data[1];
    printf("%d\n", _v_1.has_value ? _v_1.value : 0);
    opt_i32 _v_2 = arr.data[2];
    printf("%d\n", _v_2.has_value ? _v_2.value : 0);
    tsc_array_free_opt_i32(&arr);
    return 0;
}
