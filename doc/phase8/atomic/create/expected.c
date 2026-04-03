#include "runtime.h"
#include <stdatomic.h>

typedef struct { _Atomic int32_t value; } Atomic_i32;

int main(void) {
    TSC_INIT();
    Atomic_i32 counter = {.value = 0};
    printf("%d\n", atomic_load_explicit(&counter.value, memory_order_acquire));
    return 0;
}
