#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    tsc_set_add_i32(&s, 10);
    tsc_set_add_i32(&s, 20);
    tsc_set_add_i32(&s, 30);
    for (size_t _i_0 = 0; _i_0 < s.size; _i_0++) {
        const int32_t v = s._vals[_i_0];
        printf("%d\n", v);
    }
    return 0;
}

