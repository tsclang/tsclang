#include "runtime.h"
#include <stdatomic.h>

typedef struct { int32_t _refcount; _Atomic int32_t value; } Atomic_i32_shared;

int main(void) {
    TSC_INIT();
    Atomic_i32_shared *a = tsc_arc_alloc(sizeof(Atomic_i32_shared));
    atomic_init(&a->value, 0);
    atomic_store_explicit(&a->value, 99, memory_order_release);
    printf("%d\n", atomic_load_explicit(&a->value, memory_order_acquire));
    tsc_arc_release(a);
    return 0;
}
