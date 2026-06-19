#include "runtime.h"
#include <stdatomic.h>

typedef struct { _Atomic int32_t value; } Atomic_i32;

int main(void) {
    TSC_INIT();
    Atomic_i32 flags = {.value = 0};
    const int32_t old = atomic_fetch_or_explicit(&flags.value, 0xFF, memory_order_acq_rel);
    printf("%d\n", old);
    printf("%d\n", atomic_load_explicit(&flags.value, memory_order_acquire));
    return 0;
}
