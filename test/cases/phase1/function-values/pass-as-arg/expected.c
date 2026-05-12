#include "runtime.h"

int32_t double_i32(int32_t x) {
    return x * 2;
}

int32_t apply_fn_i32_i32_i32(int32_t (*f)(int32_t), int32_t x) {
    return f(x);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", apply_fn_i32_i32_i32(double_i32, 7));
    return 0;
}
