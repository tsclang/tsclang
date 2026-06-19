#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscSet_i32 a = tsc_set_create_i32();
    tsc_set_add_i32(&a, 1);
    tsc_set_add_i32(&a, 2);
    tsc_set_add_i32(&a, 3);
    TscSet_i32 b = tsc_set_create_i32();
    tsc_set_add_i32(&b, 3);
    tsc_set_add_i32(&b, 4);
    tsc_set_add_i32(&b, 5);
    const TscSet_i32 c = tsc_set_union_i32(a, b);
    printf("%d\n", c.size);
    return 0;
}
