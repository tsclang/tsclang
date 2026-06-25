#include "runtime.h"
#include <stdatomic.h>

typedef struct { int32_t length; _Atomic int32_t *data; } AtomicArray_i32;

int main(void) {
    TSC_INIT();
    AtomicArray_i32 arr = {.length = 4, .data = calloc(4, sizeof(_Atomic int32_t))};
    atomic_store_explicit(&arr.data[0], 42, memory_order_release);
    const int32_t v = atomic_load_explicit(&arr.data[0], memory_order_acquire);
    printf("%d\n", v);
    free(arr.data);
    return 0;
}
