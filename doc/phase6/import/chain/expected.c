#include "runtime.h"

int32_t double_i32(int32_t x) {
    return x * 2;
}

int32_t quadruple_i32(int32_t x) {
    return double_i32(double_i32(x));
}

int main(void) {
    TSC_INIT();
    printf("%d\n", quadruple_i32(3));
    return 0;
}
