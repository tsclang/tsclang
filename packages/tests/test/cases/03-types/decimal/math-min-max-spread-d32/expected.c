#include "runtime.h"
#include <stdio.h>
#include <stdlib.h>

typedef struct { d32_t *data; size_t length; size_t capacity; } Array_d32;

#define tsc_array_create_d32(cap) ({ size_t _c_ = (size_t)(cap); d32_t *_d_ = (d32_t*)_tsc_xmalloc(_c_ * sizeof(d32_t)); (Array_d32){ .data = _d_, .length = 0, .capacity = _c_ }; })
#define tsc_array_free_d32(arr) do { Array_d32 *_a_ = (arr); if (_a_->data && _a_->capacity > 0) free(_a_->data); _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_d32(arr, val) do { Array_d32 *_a_ = (arr); d32_t _v_ = (val); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (d32_t*)realloc(_a_->data, _nc_ * sizeof(d32_t)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

int main(void) {
    TSC_INIT();
    Array_d32 arr = tsc_array_create_d32(3);
    tsc_array_push_d32(&arr, 15000);
    tsc_array_push_d32(&arr, 3000);
    tsc_array_push_d32(&arr, 27000);
    if (arr.length == 0) { fprintf(stderr, "panic[E407]: Math.min: empty array\n"); abort(); }
    d32_t _min_0 = arr.data[0];
    for (size_t _i_1 = 1; _i_1 < arr.length; _i_1++) {
        if (arr.data[_i_1] < _min_0) _min_0 = arr.data[_i_1];
    }
    d32_t mn = _min_0;
    if (arr.length == 0) { fprintf(stderr, "panic[E407]: Math.max: empty array\n"); abort(); }
    d32_t _max_2 = arr.data[0];
    for (size_t _i_3 = 1; _i_3 < arr.length; _i_3++) {
        if (arr.data[_i_3] > _max_2) _max_2 = arr.data[_i_3];
    }
    d32_t mx = _max_2;
    printf("%s\n", tsc_dec_dtoa((int64_t)(mn), 10000, 4));
    printf("%s\n", tsc_dec_dtoa((int64_t)(mx), 10000, 4));
    tsc_array_free_d32(&arr);
    return 0;
}
