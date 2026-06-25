#include "runtime.h"
#include <stdatomic.h>

typedef struct { int32_t length; _Atomic int32_t *data; } AtomicArray_i32;

int main(void) {
    TSC_INIT();
    AtomicArray_i32 arr = {.length = 1, .data = calloc(1, sizeof(_Atomic int32_t))};
    atomic_store_explicit(&arr.data[0], 10, memory_order_release);
    int32_t _expected_0 = 10;
    const bool ok1 = atomic_compare_exchange_strong_explicit(
        &arr.data[0], &_expected_0, 20,
        memory_order_acq_rel, memory_order_acquire);
    printf("%s\n", (ok1) ? "true" : "false");
    int32_t _expected_1 = 10;
    const bool ok2 = atomic_compare_exchange_strong_explicit(
        &arr.data[0], &_expected_1, 30,
        memory_order_acq_rel, memory_order_acquire);
    printf("%s\n", (ok2) ? "true" : "false");
    printf("%d\n", atomic_load_explicit(&arr.data[0], memory_order_acquire));
    free(arr.data);
    return 0;
}
