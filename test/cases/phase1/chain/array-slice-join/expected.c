#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    Array_i32 _chain_1 = tsc_array_slice_i32(arr, 0, 2);
    printf("%s\n", tsc_array_join_i32(_chain_1, STR_LIT(", ")).data);
    return 0;
}
