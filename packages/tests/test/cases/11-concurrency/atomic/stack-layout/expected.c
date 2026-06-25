#include "runtime.h"
#include <stdatomic.h>

typedef struct { _Atomic int32_t value; } Atomic_i32;

int main(void) {
    TSC_INIT();
    Atomic_i32 a = {.value = 0};
    Atomic_i32 b = {.value = 1};
    atomic_store_explicit(&a.value,
        atomic_load_explicit(&b.value, memory_order_acquire),
        memory_order_release);
    return 0;
}
