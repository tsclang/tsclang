#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    tsc_set_add_i32(&s, 42);
    tsc_set_add_i32(&s, 10);
    opt_i32 removed = tsc_set_delete_i32(&s, 42);
    if (removed.has_value) {
        printf("%d\n", removed.value);
    }
    printf("%zu\n", s.size);
    return 0;
}
