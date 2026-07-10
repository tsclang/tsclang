#include "runtime.h"
#include <stdio.h>
#include <stdlib.h>

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    const Array_i32 arr = {.data = NULL, .length = 0, .capacity = 0};
    if (arr.length == 0) { fprintf(stderr, "panic[E407]: Math.min: empty array\n"); abort(); }
    int32_t _min_0 = arr.data[0];
    for (size_t _i_1 = 1; _i_1 < arr.length; _i_1++) {
        if (arr.data[_i_1] < _min_0) _min_0 = arr.data[_i_1];
    }
    printf("%d\n", _min_0);
    return 0;
}
