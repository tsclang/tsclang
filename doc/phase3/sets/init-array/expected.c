#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    tsc_set_add_i32(&s, 1);
    tsc_set_add_i32(&s, 2);
    tsc_set_add_i32(&s, 3);
    tsc_set_add_i32(&s, 2);
    tsc_set_add_i32(&s, 1);
    printf("%zu\n", s.size);
    printf("%s\n", tsc_set_has_i32(&s, 2) ? "true" : "false");
    return 0;
}

