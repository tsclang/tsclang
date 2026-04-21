#include "runtime.h"
#include "std/reactive.h"

typedef struct { int32_t _value; void (**_effects)(void); size_t _effect_count; int32_t (*_compute)(void); } Signal_i32;

int main(void) {
    TSC_INIT();
    Signal_i32 count = tsc_signal_create_i32(0);
    printf("%d\n", tsc_signal_get_i32(&count));
    return 0;
}
