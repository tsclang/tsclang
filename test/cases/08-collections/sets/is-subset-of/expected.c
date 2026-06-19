#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscSet_i32 a = tsc_set_create_i32();
    tsc_set_add_i32(&a, 1);
    tsc_set_add_i32(&a, 2);
    TscSet_i32 b = tsc_set_create_i32();
    tsc_set_add_i32(&b, 1);
    tsc_set_add_i32(&b, 2);
    tsc_set_add_i32(&b, 3);
    printf("%s\n", tsc_set_is_subset_of_i32(a, b) ? "true" : "false");
    printf("%s\n", tsc_set_is_subset_of_i32(b, a) ? "true" : "false");
    return 0;
}
