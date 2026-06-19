#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Array_i32 makeArr(void) {
    return tsc_array_create_i32(3);
}

int main(void) {
    TSC_INIT();
    const Array_i32 a = makeArr();
    a.data[0] = 42;
    a.data[1] = 7;
    a.data[2] = 99;
    printf("%d\n", a.data[0]);
    printf("%d\n", a.data[1]);
    printf("%d\n", a.data[2]);
    return 0;
}
