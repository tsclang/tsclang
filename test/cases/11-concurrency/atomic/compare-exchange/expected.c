#include "runtime.h"
#include <stdatomic.h>

typedef struct { _Atomic int32_t value; } Atomic_i32;

int main(void) {
    TSC_INIT();
    Atomic_i32 a = {.value = 5};
    int32_t _expected_0 = 5;
    const bool ok = atomic_compare_exchange_strong_explicit(
        &a.value, &_expected_0, 10,
        memory_order_acq_rel, memory_order_acquire);
    printf("%s\n", (ok) ? "true" : "false");
    printf("%d\n", atomic_load_explicit(&a.value, memory_order_acquire));
    return 0;
}
