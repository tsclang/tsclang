#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    printf("%zu\n", s.size);
    return 0;
}

