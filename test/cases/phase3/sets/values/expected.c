#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    tsc_set_add_i32(&s, 10);
    tsc_set_add_i32(&s, 20);
    tsc_set_add_i32(&s, 30);
    const Array_i32 arr = tsc_set_values_i32(s);
    printf("%zu\n", arr.length);
    printf("%d\n", arr.data[0]);
    return 0;
}
