#include "runtime.h"

typedef struct { d32_t *data; size_t length; size_t capacity; } Array_d32;

#define tsc_array_create_d32(cap) ({ size_t _c_ = (size_t)(cap); d32_t *_d_ = (d32_t*)_tsc_xmalloc(_c_ * sizeof(d32_t)); (Array_d32){ .data = _d_, .length = 0, .capacity = _c_ }; })
#define tsc_array_free_d32(arr) do { Array_d32 *_a_ = (arr); if (_a_->data && _a_->capacity > 0) free(_a_->data); _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_d32(arr, val) do { Array_d32 *_a_ = (arr); d32_t _v_ = (val); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (d32_t*)realloc(_a_->data, _nc_ * sizeof(d32_t)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

int main(void) {
    TSC_INIT();
    Array_d32 arr = tsc_array_create_d32(3);
    tsc_array_push_d32(&arr, 15000);
    tsc_array_push_d32(&arr, 25000);
    tsc_array_push_d32(&arr, 35000);
    String _tmp_0 = tsc_d32_to_string(arr.data[0]);
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    String _tmp_1 = tsc_d32_to_string(arr.data[1]);
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    String _tmp_2 = tsc_d32_to_string(arr.data[2]);
    printf("%s\n", _tmp_2.data);
    tsc_string_release(_tmp_2);
    tsc_array_free_d32(&arr);
    return 0;
}
