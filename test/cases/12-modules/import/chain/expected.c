#include "runtime.h"

int32_t base_double_i32(int32_t x) {
    return x * 2;
}

int32_t mid_quadruple_i32(int32_t x) {
    return base_double_i32(base_double_i32(x));
}

int main(void) {
    TSC_INIT();
    printf("%d\n", mid_quadruple_i32(3));
    return 0;
}
