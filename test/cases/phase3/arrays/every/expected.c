#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static bool _lambda_0_bool(int32_t x) {
    return x % 2 == 0;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {2, 4, 6};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%s\n", tsc_array_every_i32(arr, _lambda_0_bool) ? "true" : "false");
    return 0;
}
