#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int32_t sumPair(int32_t *_arr) {
    int32_t a = _arr[0];
    int32_t b = _arr[1];
    return a + b;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {3, 4};
    const Array_i32 arr = {.data = _lit_0, .length = 2, .capacity = 2};
    printf("%d\n", sumPair(arr.data));
    return 0;
}
