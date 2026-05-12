#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

void fill_mut_Array_i32(Array_i32 *arr) {
    arr->data[0] = 99;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    Array_i32 nums = {.data = _lit_0, .length = 3, .capacity = 3};
    fill_mut_Array_i32(&nums);
    printf("%d\n", nums.data[0]);
    return 0;
}
