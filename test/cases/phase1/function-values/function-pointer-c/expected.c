#include "runtime.h"

int32_t square_i32(int32_t x) {
    return x * x;
}

int main(void) {
    TSC_INIT();
    tsc_closure fns = {(tsc_closure){.env = NULL, .fn = (void*)square_i32}};
    printf("%d\n", fns[0](4));
    return 0;
}
