#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    tsc_set_add_i32(&s, 1);
    tsc_set_add_i32(&s, 2);
    tsc_set_add_i32(&s, 1);
    printf("%zu\n", s.size);
    printf("%s\n", tsc_set_has_i32(&s, 1) ? "true" : "false");
    printf("%s\n", tsc_set_has_i32(&s, 3) ? "true" : "false");
    opt_i32 removed = tsc_set_delete_i32(&s, 1);
    printf("%d\n", removed.value);
    printf("%zu\n", s.size);
    return 0;
}
