#include "runtime.h"

int32_t double_i32(int32_t x) {
    return x * 2;
}

int main(void) {
    TSC_INIT();
    tsc_closure fn = {.env = NULL, .fn = (void*)double_i32};
    printf("%d\n", ((tsc_closure (*)(void *, int32_t))fn.fn)(fn.env, 5));
    return 0;
}
