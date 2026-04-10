#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int32_t third(int32_t *_arr) {
    int32_t c = _arr[2];
    return c;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 7};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%d\n", third(arr.data));
    return 0;
}
