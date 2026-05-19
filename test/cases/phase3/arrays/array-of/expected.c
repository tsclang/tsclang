#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _of_0_0 = 10;
    int32_t _of_0_1 = 20;
    int32_t _of_0_2 = 30;
    int32_t _of_0_data[] = {_of_0_0, _of_0_1, _of_0_2};
    Array_i32 _of_0 = {.data = _of_0_data, .length = 3, .capacity = 3};
    const Array_i32 arr = _of_0;
    printf("%zu\n", arr.length);
    printf("%d\n", arr.data[0]);
    printf("%d\n", arr.data[2]);
    return 0;
}
