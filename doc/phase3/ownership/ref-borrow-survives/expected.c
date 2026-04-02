#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int32_t sum_ref_Array_i32(const Array_i32 *data) {
    int32_t total = 0;
    for (int32_t i = 0; i < (int32_t)data->length; i++) {
        total = total + data->data[i];
    }
    return total;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 data = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%d\n", sum_ref_Array_i32(&data));
    printf("%zu\n", data.length);
    return 0;
}
