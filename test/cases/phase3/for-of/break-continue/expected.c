#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4, 5};
    const Array_i32 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    for (size_t _i_0 = 0; _i_0 < arr.length; _i_0++) {
        const int32_t item = arr.data[_i_0];
        if (item == 3) continue;
        if (item == 5) break;
        printf("%d\n", item);
    }
    return 0;
}
