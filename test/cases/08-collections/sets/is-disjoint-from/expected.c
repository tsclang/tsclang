#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscSet_i32 a = tsc_set_create_i32();
    tsc_set_add_i32(&a, 1);
    tsc_set_add_i32(&a, 2);
    TscSet_i32 b = tsc_set_create_i32();
    tsc_set_add_i32(&b, 3);
    tsc_set_add_i32(&b, 4);
    printf("%s\n", tsc_set_is_disjoint_from_i32(a, b) ? "true" : "false");
    tsc_set_add_i32(&a, 3);
    printf("%s\n", tsc_set_is_disjoint_from_i32(a, b) ? "true" : "false");
    return 0;
}
