#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {10, 20, 30};
    Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    for (size_t _i_0 = 0; _i_0 < arr.length; _i_0++) {
        int32_t item = arr.data[_i_0];
        item = item + 1;
        printf("%d\n", item);
    }
    return 0;
}
