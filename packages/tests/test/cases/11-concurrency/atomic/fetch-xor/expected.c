#include "runtime.h"
#include <stdatomic.h>

typedef struct { _Atomic int32_t value; } Atomic_i32;

int main(void) {
    TSC_INIT();
    Atomic_i32 flags = {.value = 0xFF};
    const int32_t old = atomic_fetch_xor_explicit(&flags.value, 0x0F, memory_order_acq_rel);
    printf("%d\n", old);
    printf("%d\n", atomic_load_explicit(&flags.value, memory_order_acquire));
    return 0;
}
