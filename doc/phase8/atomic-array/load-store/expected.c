#include "runtime.h"
#include <stdatomic.h>

typedef struct { int32_t length; _Atomic int32_t *data; } AtomicArray_i32;

int main(void) {
    TSC_INIT();
    AtomicArray_i32 arr = {.length = 3, .data = calloc(3, sizeof(_Atomic int32_t))};
    atomic_store_explicit(&arr.data[0], 10, memory_order_release);
    atomic_store_explicit(&arr.data[1], 20, memory_order_release);
    atomic_store_explicit(&arr.data[2], 30, memory_order_release);
    const int32_t a = atomic_load_explicit(&arr.data[0], memory_order_acquire);
    const int32_t b = atomic_load_explicit(&arr.data[1], memory_order_acquire);
    printf("%d\n", a);
    printf("%d\n", b);
    free(arr.data);
    return 0;
}
