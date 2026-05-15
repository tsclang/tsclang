#include "runtime.h"

int32_t double_i32(int32_t x) {
    return x * 2;
}

int32_t apply_fn_i32_i32_i32(tsc_closure f, int32_t x) {
    return ((int32_t (*)(void *, int32_t))f.fn)(f.env, x);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", apply_fn_i32_i32_i32((tsc_closure){.env = NULL, .fn = (void*)double_i32}, 7));
    return 0;
}
