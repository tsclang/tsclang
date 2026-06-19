#include "runtime.h"
#include <stdatomic.h>

typedef struct { int32_t length; _Atomic int32_t *data; } AtomicArray_i32;

int main(void) {
    TSC_INIT();
    AtomicArray_i32 arr = {.length = 2, .data = calloc(2, sizeof(_Atomic int32_t))};
    atomic_store_explicit(&arr.data[0], 5, memory_order_release);
    const int32_t old = atomic_fetch_add_explicit(&arr.data[0], 3, memory_order_acq_rel);
    printf("%d\n", old);
    printf("%d\n", atomic_load_explicit(&arr.data[0], memory_order_acquire));
    free(arr.data);
    return 0;
}
